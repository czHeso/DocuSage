import {
  SEMANTIC_ANSWER_PROMPT,
  SEMANTIC_PROMPT_LABELS,
  CHUNKING_SHORT_PROMPT,
  CHUNK_SELECTION_SHORT_PROMPT,
  CHUNK_SELECTION_CANDIDATES_PROMPT,
  CHUNK_CANDIDATE_LABELS,
  NO_RELEVANT_INFORMATION_MESSAGE,
  ANSWER_GENERATION_FAILED_MESSAGE,
} from '../prompts';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db.js';
import { pdfs, documentChunks, projects, failedResponses, chatSessions } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { streamAnswer, supportsStreaming, type TokenSink } from './answerStream.js';
import { embedText } from './embeddings.js';
import { storeChunkVector } from './searchIndex.js';
import { findRelevantChunks } from './retrieval.js';

interface DocumentChunk {
  content: string;
  topic: string;
  summary: string;
  keywords: string[];
  pageRange: string;
  chunkIndex: number;
  embedding?: number[] | null;
}

export class DocumentProcessor {
  
  // Main function - processing a PDF after upload
  static async processUploadedPDF(pdfId: number, content: string, projectId: number) {
    console.log(`Starting to process PDF ${pdfId} with ${content.length} characters`);
    
    try {
      // Load the project and its AI settings
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      console.log(`🔧 Using AI provider: ${project.aiProvider}, model: ${project.aiModel}`);
      
      // Update the status to "processing"
      await db.update(pdfs)
        .set({ processingStatus: 'processing' })
        .where(eq(pdfs.id, pdfId));

      // The AI splits the document into topical blocks using the selected provider
      const chunks = await this.chunkDocumentWithAI(content, project);
      
      // Generate embeddings for each chunk using the selected provider
      console.log(`🔗 Generating embeddings for ${chunks.length} chunks...`);
      for (const chunk of chunks) {
        try {
          chunk.embedding = await this.generateEmbeddingForChunk(chunk.content, project);
          if (chunk.embedding) {
            console.log(`✅ Embedding generated for chunk "${chunk.topic}" (${chunk.embedding.length} dimensions)`);
          }
        } catch (error) {
          console.error(`❌ Error generating the embedding for chunk "${chunk.topic}":`, error);
          chunk.embedding = null;
        }
      }
      
      // Store the chunks in the database
      await this.saveDocumentChunks(pdfId, projectId, chunks);
      
      // Mark as completed
      await db.update(pdfs)
        .set({ 
          processingStatus: 'completed',
          processedAt: new Date()
        })
        .where(eq(pdfs.id, pdfId));

      console.log(`✅ PDF ${pdfId} processed - created ${chunks.length} chunks`);
      
      return {
        success: true,
        chunksCreated: chunks.length,
        totalTokens: chunks.reduce((sum: number, chunk: DocumentChunk) => sum + this.estimateTokens(chunk.content), 0)
      };
      
    } catch (error) {
      console.error('Error processing the PDF:', error);
      
      await db.update(pdfs)
        .set({ 
          processingStatus: 'failed',
          processingError: error instanceof Error ? error.message : 'Unknown error'
        })
        .where(eq(pdfs.id, pdfId));
      
      throw error;
    }
  }

  // Universal AI chunking - supports OpenAI, Google, Azure
  private static async chunkDocumentWithAI(content: string, project: any): Promise<DocumentChunk[]> {
    const { aiProvider, aiModel, openaiApiKey, azureEndpoint } = project;
    
    console.log(`🤖 Starting ${aiProvider} chunking for ${content.length} characters...`);
    
    // Check the document length
    const estimatedTokens = this.estimateTokens(content);
    console.log(`📊 Estimated token count: ${estimatedTokens}`);
    
    if (estimatedTokens > 12000) {
      console.log(`📋 The document is too long (${estimatedTokens} tokens), switching to incremental processing`);
      return await this.chunkLongDocumentProgressivelyWithAI(content, project);
    }

    const prompt = CHUNKING_SHORT_PROMPT(content);

    try {
      console.log(`📤 Sending the request to ${aiProvider}...`);
      
      let result;
      switch (aiProvider) {
        case 'openai':
          result = await this.processWithOpenAI(prompt, aiModel, openaiApiKey);
          break;
        case 'google':
          result = await this.processWithGoogle(prompt, aiModel, openaiApiKey);
          break;
        case 'azure':
          result = await this.processWithAzure(prompt, aiModel, openaiApiKey, azureEndpoint);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${aiProvider}`);
      }

      console.log('📥 Response received from the AI');
      return this.parseAIResponse(result);
      
    } catch (error) {
      console.error(`❌ ${aiProvider} chunking failed:`, error);
      console.log('⚠️ Falling back to the backup chunking method...');
      return this.fallbackChunking(content);
    }
  }



  // Fallback chunking for part of the document
  private static fallbackChunkingForPart(content: string, partIndex: number, startChunkIndex: number): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const maxChunkSize = 1000; // tokens
    const overlap = 100; // tokens
    
    let start = 0;
    let chunkIndex = startChunkIndex;
    
    while (start < content.length) {
      const estimatedEnd = start + Math.floor(maxChunkSize * 4); // aproximace 4 znaky = 1 token
      const finalEnd = Math.min(estimatedEnd, content.length);
      const finalContent = content.slice(start, finalEnd);
      
      chunks.push({
        content: finalContent,
        topic: `Part ${partIndex + 1} - Section ${chunkIndex - startChunkIndex + 1}`,
        summary: finalContent.slice(0, 200) + '...',
        keywords: this.extractKeywords(finalContent),
        pageRange: `${partIndex + 1}`,
        chunkIndex: chunkIndex++
      });
      
      start = finalEnd - Math.floor(overlap * 4);
    }
    
    return chunks;
  }

  // Fallback splitting method if ChatGPT fails
  private static fallbackChunking(content: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const chunkSize = 3000; // Asi 500-750 slov
    const overlap = 200; // Overlap between blocks
    
    let start = 0;
    let chunkIndex = 0;
    
    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunkContent = content.slice(start, end);
      
      // Find the end of a sentence for a cleaner cut
      const lastPeriod = chunkContent.lastIndexOf('.');
      const finalEnd = lastPeriod > start + chunkSize * 0.8 ? lastPeriod + 1 : end;
      
      const finalContent = content.slice(start, finalEnd);
      
      chunks.push({
        content: finalContent,
        topic: `Sekce ${chunkIndex + 1}`,
        summary: finalContent.slice(0, 150) + '...',
        keywords: this.extractKeywords(finalContent),
        pageRange: `${Math.floor(chunkIndex * 2) + 1}-${Math.floor(chunkIndex * 2) + 3}`,
        chunkIndex
      });
      
      start = finalEnd - overlap;
      chunkIndex++;
    }
    
    return chunks;
  }

  // AI provider specific implementations
  private static async processWithOpenAI(prompt: string, model: string, apiKey: string): Promise<string> {
    const openai = new OpenAI({ apiKey });
    const response = await Promise.race([
      openai.chat.completions.create({
        model: model === 'gpt-4' ? 'gpt-4o' : model, // Use latest GPT-4 variant
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 6000 // Raised limit for better chunks
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI timeout after 180 seconds')), 180000) // Timeout raised to 3 minutes
      )
    ]) as any;

    return response.choices[0]?.message?.content || '';
  }

  private static async processWithGoogle(prompt: string, model: string, apiKey: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ model: model === 'gemini-pro' ? 'gemini-1.5-pro' : model });
    
    const result = await Promise.race([
      geminiModel.generateContent(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google AI timeout after 180 seconds')), 180000)
      )
    ]) as any;

    return result.response.text() || '';
  }

  private static async processWithAzure(prompt: string, model: string, apiKey: string, endpoint: string): Promise<string> {
    const azureOpenai = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${model}`,
      defaultQuery: { 'api-version': '2024-02-15-preview' },
      defaultHeaders: {
        'api-key': apiKey,
      },
    });

    const response = await Promise.race([
      azureOpenai.chat.completions.create({
        model, // Use deployment name directly for Azure
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 6000
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Azure OpenAI timeout after 180 seconds')), 180000)
      )
    ]) as any;

    return response.choices[0]?.message?.content || '';
  }

  // Advanced features with configurable settings from TrainingOptions
  private static async processWithOpenAIAdvanced(prompt: string, model: string, apiKey: string, temperature: number, contextSize: number): Promise<string> {
    const openai = new OpenAI({ apiKey });
    const response = await Promise.race([
      openai.chat.completions.create({
        model: model === 'gpt-4' ? 'gpt-4o' : model,
        messages: [{ role: "user", content: prompt }],
        temperature: temperature,
        max_tokens: Math.min(contextSize, 4000)
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI timeout after 180 seconds')), 180000)
      )
    ]) as any;

    return response.choices[0]?.message?.content || '';
  }

  private static async processWithGoogleAdvanced(prompt: string, model: string, apiKey: string, temperature: number): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiModel = genAI.getGenerativeModel({ 
      model: model === 'gemini-pro' ? 'gemini-1.5-pro' : model,
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: 4000
      }
    });
    
    const result = await Promise.race([
      geminiModel.generateContent(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Google AI timeout after 180 seconds')), 180000)
      )
    ]) as any;

    return result.response.text() || '';
  }

  private static async processWithAzureAdvanced(prompt: string, model: string, apiKey: string, endpoint: string, temperature: number, contextSize: number): Promise<string> {
    const azureOpenai = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${model}`,
      defaultQuery: { 'api-version': '2024-02-15-preview' },
      defaultHeaders: {
        'api-key': apiKey,
      },
    });

    const response = await Promise.race([
      azureOpenai.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: temperature,
        max_tokens: Math.min(contextSize, 4000)
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Azure OpenAI timeout after 180 seconds')), 180000)
      )
    ]) as any;

    return response.choices[0]?.message?.content || '';
  }

  private static parseAIResponse(result: string): DocumentChunk[] {
    if (!result) {
      throw new Error('Empty response from the AI');
    }

    console.log('🔍 AI response (first 200 characters):', result.substring(0, 200));

    // Strip the markdown fence and parse the JSON response
    let cleanResult = result.trim();
    if (cleanResult.startsWith('```json')) {
      cleanResult = cleanResult.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (cleanResult.startsWith('```')) {
      cleanResult = cleanResult.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log('🧹 Cleaned response (first 200 characters):', cleanResult.substring(0, 200));
    
    let chunks;
    try {
      chunks = JSON.parse(cleanResult);
    } catch (parseError) {
      console.error('❌ JSON parse error:', parseError);
      console.log('📝 Problematic JSON (first 500 characters):', cleanResult.substring(0, 500));
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parsing error';
      throw new Error(`The AI returned invalid JSON: ${errorMessage}`);
    }
    
    if (!Array.isArray(chunks)) {
      console.error('❌ The AI did not return an array of chunks, but:', typeof chunks);
      throw new Error('The AI did not return an array of chunks');
    }

    console.log(`✅ The AI created ${chunks.length} chunks with topics:`, chunks.map(c => c.topic));

    const processedChunks = chunks.map((chunk, index) => {
      const processedChunk = {
        content: chunk.content || '',
        topic: chunk.topic || `Blok ${index + 1}`,
        summary: chunk.summary || '',
        keywords: Array.isArray(chunk.keywords) ? chunk.keywords : [],
        pageRange: chunk.pageRange || '1',
        chunkIndex: index
      };
      
      console.log(`🔍 AI chunk ${index}: "${processedChunk.topic}" - content (${processedChunk.content.length} characters): "${processedChunk.content.substring(0, 100)}"`);
      return processedChunk;
    });
    
    return processedChunks;
  }

  /**
   * Generates the embedding for one chunk.
   *
   * Delegates to services/embeddings so that indexing and querying always use
   * the same model - a query embedded with a different one is not comparable
   * with what is stored.
   */
  private static async generateEmbeddingForChunk(content: string, project: any): Promise<number[] | null> {
    return embedText(content, project);
  }

  // Incremental processing of long documents with AI
  private static async chunkLongDocumentProgressivelyWithAI(content: string, project: any): Promise<DocumentChunk[]> {
    const segments = this.splitIntoSegments(content, 8000); // Smaller segments for AI processing
    const allChunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    console.log(`📋 Splitting the document into ${segments.length} segments for incremental processing`);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`🔄 Processing segment ${i + 1}/${segments.length} (${segment.length} characters)`);
      
      try {
        const segmentChunks = await this.chunkDocumentWithAI(segment, project);
        
        // Add the chunks with sequential indexes
        for (const chunk of segmentChunks) {
          allChunks.push({
            ...chunk,
            topic: chunk.topic || `Segment ${i + 1} - Blok ${chunkIndex + 1}`,
            pageRange: chunk.pageRange || `${i + 1}`,
            chunkIndex: chunkIndex++
          });
        }

        console.log(`✅ Segment ${i + 1} processed - created ${segmentChunks.length} chunks`);
        
        // Short pause between requests
        if (i < segments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
      } catch (error) {
        console.warn(`⚠️ Error processing segment ${i + 1}, falling back to backup chunking:`, error);
        
        // Fallback chunking for this segment
        const fallbackChunks = this.fallbackChunkingForPart(segment, i, chunkIndex);
        allChunks.push(...fallbackChunks);
        chunkIndex += fallbackChunks.length;
      }
    }
    
    console.log(`🎉 Incremental processing finished - ${allChunks.length} chunks in total`);
    return allChunks;
  }

  // Store the chunks in the database
  private static async saveDocumentChunks(pdfId: number, projectId: number, chunks: DocumentChunk[]) {
    console.log(`💾 Storing ${chunks.length} chunks in the database for PDF ${pdfId}`);
    
    for (const chunk of chunks) {
      console.log(`📝 Storing chunk ${chunk.chunkIndex}: "${chunk.topic}" (${chunk.content.length} characters)`);
      console.log(`   First 100 characters of content: "${chunk.content.substring(0, 100)}"`);
      console.log(`   Souhrn: ${chunk.summary?.substring(0, 50)}...`);
      console.log(`   Keywords: ${Array.isArray(chunk.keywords) ? chunk.keywords.join(', ') : 'none'}`);
      console.log(`   Keywords type: ${typeof chunk.keywords}, value:`, chunk.keywords);
      
      const [inserted] = await db.insert(documentChunks).values({
        pdfId,
        projectId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        topic: chunk.topic || null,
        summary: chunk.summary || null,
        keywords: Array.isArray(chunk.keywords) ? chunk.keywords : null,
        pageRange: chunk.pageRange || '1',
        tokenCount: this.estimateTokens(chunk.content),
        contextType: 'general',
        confidence: chunk.topic ? 95 : 85, // Higher confidence for ChatGPT chunks
        embedding: chunk.embedding || null,
        processedAt: new Date()
      }).returning({ id: documentChunks.id });

      // Mirror the embedding into the pgvector column so the chunk is searchable
      // immediately. Without this it would only become searchable on the next
      // restart, when the backfill runs.
      await storeChunkVector(inserted.id, chunk.embedding);
    }
    
    console.log(`✅ All chunks stored for PDF ${pdfId}`);
  }

  // Two-stage search for user queries, supporting all AI providers
  static async findRelevantChunksAndRespond(
    query: string, 
    projectId: number, 
    customPrompt?: string,
    sessionId?: number,
    trainingOptions?: any,
    /**
     * When supplied, the answer is streamed and this is called for every piece
     * of text. The complete answer is still returned, so callers that store the
     * message do not have to reassemble it.
     */
    onToken?: TokenSink
  ) {
    // Nothing derived from the question goes in the log - not the text, not its
    // length. It is the visitor's own words, it can carry personal data, and it
    // is already stored in chat_messages and, when the answer fails, in
    // failed_responses. Both of those have a retention policy; a log file does
    // not. The identifiers below are enough to find the conversation there.
    console.log(`[DocumentProcessor] Starting the two-stage search (project ${projectId}, session ${sessionId ?? 'new'})`);
    
    // Load the project and its AI settings
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    console.log(`[DocumentProcessor] Using AI provider: ${project.aiProvider}, model: ${project.aiModel}`);
    
    // Load the conversation context (last 3 messages)
    let conversationContext = '';
    if (sessionId) {
      const { chatSessions, chatMessages } = await import('../../shared/schema.js');
      const recentMessages = await db.select({
        isFromUser: chatMessages.isFromUser,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt)
      .limit(6); // The last 6 messages (3 question-answer pairs)
      
      if (recentMessages.length > 0) {
        conversationContext = recentMessages
          .map(msg => `${msg.isFromUser ? 'User' : 'Asistent'}: ${msg.content}`)
          .join('\n');
        console.log(`[DocumentProcessor] Loaded conversation context: ${recentMessages.length} messages`);
      }
    }
    
    // STEP 1: the AI picks the most relevant blocks using the conversation context
    const relevantChunks = await this.selectRelevantChunksWithAI(query, projectId, project, conversationContext, trainingOptions);
    
    if (relevantChunks.length === 0) {
      // Record the unsuccessful answer for admin notifications
      await this.logFailedResponse(
        projectId, 
        sessionId, 
        query, 
        NO_RELEVANT_INFORMATION_MESSAGE,
        "no_relevant_chunks",
        0,
        0
      );
      
      return {
        response: NO_RELEVANT_INFORMATION_MESSAGE,
        chunksUsed: 0,
        tokensUsed: 0
      };
    }
    
    // STEP 2: the AI generates an answer from the selected blocks and context
    const response = await this.generateAnswerFromChunksWithAI(query, relevantChunks, project, customPrompt, conversationContext, trainingOptions, onToken);
    
    // Check whether the answer indicates the AI lacks sufficient information
    // Single source of truth – kept in services/failureDetection.ts so both
    // detection paths recognise exactly the same phrases.
    const { FAILURE_INDICATORS: failureIndicators } = await import('./failureDetection');
    
    const hasFailureIndicator = failureIndicators.some(indicator => 
      response.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (hasFailureIndicator) {
      // Record a partially unsuccessful answer
      await this.logFailedResponse(
        projectId,
        sessionId,
        query,
        response,
        "insufficient_context",
        relevantChunks.length,
        relevantChunks.length
      );
    }
    
    return {
      response: response,
      chunksUsed: relevantChunks.length,
      tokensUsed: relevantChunks.reduce((sum, chunk) => sum + this.estimateTokens(chunk.content), 0)
    };
  }

  // STEP 1: hybrid retrieval, then the AI narrows the candidates down using the conversation context
  private static async selectRelevantChunksWithAI(
    query: string,
    projectId: number,
    project: any,
    conversationContext?: string,
    trainingOptions?: any
  ) {
    // Candidate generation is vector + full-text search inside PostgreSQL
    // (services/retrieval.ts). It used to be a full scan of every chunk in the
    // project scored by substring occurrences, which neither scaled nor
    // survived Czech inflection.
    const candidates = await findRelevantChunks({
      projectId,
      query,
      project,
      limit: Math.max(5, Math.min(30, trainingOptions?.maxDocuments ?? 15)),
      customStopWords: trainingOptions?.customStopWords,
    });

    if (candidates.length === 0) return [];

    console.log(
      `[DocumentProcessor] Retrieval returned ${candidates.length} candidates ` +
      `(${candidates.filter(c => c.matchedBy.includes('vector')).length} via vector, ` +
      `${candidates.filter(c => c.matchedBy.includes('text')).length} via full text)`
    );

    // Extended prompt including the conversation context
    let selectionPrompt = CHUNK_SELECTION_SHORT_PROMPT;

    if (conversationContext) {
      selectionPrompt += `

KONTEXT KONVERZACE:
${conversationContext}`;
    }

    selectionPrompt += CHUNK_SELECTION_CANDIDATES_PROMPT(
      query,
      candidates.map((item, index) =>
        `${index}: [${item.topic}] ${item.summary}
     ${CHUNK_CANDIDATE_LABELS.keywords}: ${Array.isArray(item.keywords) ? (item.keywords as string[]).join(', ') : CHUNK_CANDIDATE_LABELS.none}
     ${CHUNK_CANDIDATE_LABELS.page}: ${item.pageRange}
     ${CHUNK_CANDIDATE_LABELS.documentWeight}: ${item.weight}/10 (${CHUNK_CANDIDATE_LABELS.score}: ${item.score.toFixed(4)})`
      ).join('\n\n')
    );

    try {
      const { aiProvider, aiModel, openaiApiKey, azureEndpoint } = project;

      let selectionResult;
      switch (aiProvider) {
        case 'openai':
          selectionResult = await this.processWithOpenAI(selectionPrompt, aiModel, openaiApiKey);
          break;
        case 'google':
          selectionResult = await this.processWithGoogle(selectionPrompt, aiModel, openaiApiKey);
          break;
        case 'azure':
          selectionResult = await this.processWithAzure(selectionPrompt, aiModel, openaiApiKey, azureEndpoint);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${aiProvider}`);
      }

      const selectedIndices = selectionResult
        ?.split(',')
        .map(s => parseInt(s.trim()))
        .filter(i => !isNaN(i) && i >= 0 && i < candidates.length) || [];

      // The model returning nothing usable is not a reason to answer without
      // context - the retrieval ranking is a perfectly good second opinion.
      if (selectedIndices.length === 0) {
        console.log('[DocumentProcessor] The model selected no block, using the retrieval ranking');
        return candidates.slice(0, 3);
      }

      const selectedChunks = selectedIndices.map(i => candidates[i]);

      // Extend the selection with related blocks that share a keyword or topic.
      // These are drawn from the same candidate set, so a "related" block is one
      // retrieval already considered relevant - the old version pulled them from
      // the whole project, which could attach an unrelated chunk to the answer.
      const expandedChunks = [...selectedChunks];
      for (const selectedChunk of selectedChunks) {
        if (expandedChunks.length >= 6) break;

        const related = candidates.find(candidate =>
          !expandedChunks.some(existing => existing.id === candidate.id) &&
          this.sharesSubject(selectedChunk, candidate)
        );

        if (related) {
          expandedChunks.push(related);
          console.log(`[DocumentProcessor] Added a related block: "${related.topic}"`);
        }
      }

      console.log(
        `[DocumentProcessor] Selected ${expandedChunks.length} relevant blocks ` +
        `(${selectedChunks.length} primary + ${expandedChunks.length - selectedChunks.length} related) via ${aiProvider}`
      );

      return expandedChunks;

    } catch (error) {
      console.warn('Block selection failed, using the retrieval ranking:', error);
      // Fallback: the best-ranked blocks. Previously this returned the first
      // three rows in the table, which had nothing to do with the question.
      return candidates.slice(0, 3);
    }
  }

  /** True when two chunks share a keyword or the leading word of their topic. */
  private static sharesSubject(a: { keywords: unknown; topic: string | null }, b: { keywords: unknown; topic: string | null }): boolean {
    if (Array.isArray(a.keywords) && Array.isArray(b.keywords)) {
      const other = new Set((b.keywords as string[]).map(k => String(k).toLowerCase()));
      if ((a.keywords as string[]).some(k => other.has(String(k).toLowerCase()))) return true;
    }

    const leadWord = (topic: string | null) => topic?.toLowerCase().split(' ')[0] ?? '';
    const aLead = leadWord(a.topic);
    const bLead = leadWord(b.topic);
    if (!aLead || !bLead) return false;

    return aLead === bLead;
  }

  // STEP 2: universal answer generation from the selected blocks via the AI provider
  private static async generateAnswerFromChunksWithAI(
    query: string, 
    chunks: any[], 
    project: any,
    customPrompt?: string,
    conversationContext?: string,
    trainingOptions?: any,
    onToken?: TokenSink
  ) {
    const context = chunks.map((chunk, i) => 
      `${chunk.topic} (str. ${chunk.pageRange}):\n${chunk.content}`
    ).join('\n\n');

    const systemPrompt = customPrompt || SEMANTIC_ANSWER_PROMPT;

    let answerPrompt = systemPrompt + '\n';

    if (conversationContext) {
      answerPrompt += `\n${SEMANTIC_PROMPT_LABELS.conversationContext}:\n${conversationContext}\n`;
    }

    answerPrompt += `\n${SEMANTIC_PROMPT_LABELS.availableInformation}:\n${context}\n\n${SEMANTIC_PROMPT_LABELS.currentQuestion}: ${query}\n\n${SEMANTIC_PROMPT_LABELS.answer}:`;

    try {
      const { aiProvider, aiModel, openaiApiKey, azureEndpoint } = project;
      
      // AI settings (temperature, etc.) from trainingOptions
      const temperature = trainingOptions?.temperatureValue || 0.7;
      const contextSize = trainingOptions?.contextSize || 2048;
      
      let response;

      if (onToken && supportsStreaming(aiProvider)) {
        response = await streamAnswer(
          {
            prompt: answerPrompt,
            model: aiModel,
            apiKey: openaiApiKey,
            temperature,
            maxTokens: Math.min(contextSize, 4000),
            azureEndpoint,
          },
          aiProvider,
          onToken
        );
      } else {
        switch (aiProvider) {
          case 'openai':
            response = await this.processWithOpenAIAdvanced(answerPrompt, aiModel, openaiApiKey, temperature, contextSize);
            break;
          case 'google':
            response = await this.processWithGoogleAdvanced(answerPrompt, aiModel, openaiApiKey, temperature);
            break;
          case 'azure':
            response = await this.processWithAzureAdvanced(answerPrompt, aiModel, openaiApiKey, azureEndpoint, temperature, contextSize);
            break;
          default:
            throw new Error(`Unsupported AI provider: ${aiProvider}`);
        }
      }
      
      console.log(`Answer generated via ${aiProvider}/${aiModel} (temp: ${temperature})`);
      return response || ANSWER_GENERATION_FAILED_MESSAGE;
      
    } catch (error) {
      console.error('Answer generation failed:', error);
      return "I am sorry, an error occurred while generating the answer.";
    }
  }



  // Helper functions
  private static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4); // Rough estimate
  }

  private static extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4)
      .slice(0, 5);
    
    return Array.from(new Set(words));
  }

  // Record the unsuccessful answer for admin notifications
  private static async logFailedResponse(
    projectId: number,
    sessionId: number | undefined,
    userQuery: string,
    aiResponse: string,
    failureReason: string,
    chunksFound: number,
    documentsSearched: number
  ) {
    try {
      await db.insert(failedResponses).values({
        projectId,
        sessionId: sessionId || null,
        userQuery,
        aiResponse,
        failureReason,
        chunksFound,
        documentsSearched,
        isResolved: false,
        createdAt: new Date()
      });
      
      console.log(`[DocumentProcessor] Recorded an unsuccessful answer for project ${projectId}: ${failureReason}`);
    } catch (error) {
      console.error('[DocumentProcessor] Error recording the unsuccessful answer:', error);
    }
  }

  // Split the document into smaller segments
  private static splitIntoSegments(content: string, maxChars: number): string[] {
    const segments: string[] = [];
    let start = 0;
    
    while (start < content.length) {
      let end = Math.min(start + maxChars, content.length);
      
      // Try to find the end of a sentence for a better cut point
      if (end < content.length) {
        const lastPeriod = content.lastIndexOf('.', end);
        const lastNewline = content.lastIndexOf('\n', end);
        const cutPoint = Math.max(lastPeriod, lastNewline);
        
        if (cutPoint > start + maxChars * 0.5) {
          end = cutPoint + 1;
        }
      }
      
      segments.push(content.slice(start, end));
      start = end;
    }
    
    return segments;
  }
}
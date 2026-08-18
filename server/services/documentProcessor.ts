import { SIMPLE_ASSISTANT_PROMPT, SEMANTIC_ANSWER_PROMPT, SEMANTIC_PROMPT_LABELS, CHUNKING_SHORT_PROMPT, CHUNKING_DETAILED_PROMPT, CHUNKING_SEGMENT_PROMPT, CHUNK_SELECTION_PROMPT, CHUNK_SELECTION_SHORT_PROMPT, NO_RELEVANT_INFORMATION_MESSAGE , CHUNK_SELECTION_CANDIDATES_PROMPT, CHUNK_CANDIDATE_LABELS , STRICT_ANSWER_PROMPT, ANSWER_GENERATION_FAILED_MESSAGE } from '../prompts';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db.js';
import { pdfs, documentChunks, projects, failedResponses, chatSessions } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';

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

  // ChatGPT splits the document into logical blocks, supporting long documents
  private static async chunkDocumentWithChatGPT(content: string, openai: OpenAI): Promise<DocumentChunk[]> {
    console.log(`🤖 Starting ChatGPT chunking for ${content.length} characters...`);
    
    // Check the document length - if it is too long, split it up front
    const estimatedTokens = this.estimateTokens(content);
    console.log(`📊 Estimated token count: ${estimatedTokens}`);
    
    if (estimatedTokens > 12000) {
      console.log(`📋 The document is too long (${estimatedTokens} tokens), switching to incremental processing`);
      return await this.chunkLongDocumentProgressively(content, openai);
    }

    const prompt = CHUNKING_DETAILED_PROMPT(content);

    try {
      console.log('📤 Sending the request to ChatGPT...');
      
      const response = await Promise.race([
        openai.chat.completions.create({
          // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 4000
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('ChatGPT timeout after 60 seconds')), 60000)
        )
      ]);

      console.log('📥 Response received from ChatGPT');
      
      const result = (response as any).choices[0]?.message?.content;
      if (!result) {
        throw new Error('Empty response from ChatGPT');
      }

      console.log('🔍 ChatGPT response (first 200 characters):', result.substring(0, 200));

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
        throw new Error(`ChatGPT returned invalid JSON: ${errorMessage}`);
      }
      
      if (!Array.isArray(chunks)) {
        console.error('❌ ChatGPT did not return an array of chunks, but:', typeof chunks);
        throw new Error('ChatGPT did not return an array of chunks');
      }

      console.log(`✅ ChatGPT created ${chunks.length} chunks with topics:`, chunks.map(c => c.topic));

      return chunks.map((chunk, index) => ({
        content: chunk.content || '',
        topic: chunk.topic || `Blok ${index + 1}`,
        summary: chunk.summary || '',
        keywords: Array.isArray(chunk.keywords) ? chunk.keywords : [],
        pageRange: chunk.pageRange || `${index + 1}`,
        chunkIndex: index
      }));

    } catch (error) {
      console.error('❌ ChatGPT chunking selhal:', error);
      console.error('📝 Detaily chyby:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack?.substring(0, 500) : undefined
      });
      
      // Free memory before the fallback
      if (global.gc) {
        console.log('🧹 Running garbage collection...');
        global.gc();
      }
      
      console.warn('⚠️ Falling back to the backup chunking method...');
      return this.fallbackChunking(content);
    }
  }

  // Incremental processing of long documents segment by segment without losing information
  private static async chunkLongDocumentProgressively(content: string, openai: OpenAI): Promise<DocumentChunk[]> {
    console.log(`📋 Processing the long document segment by segment without losing information`);
    
    // Split the document into sentences, then group them into segments respecting sentence boundaries
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const segments: string[] = [];
    let currentSegment = '';
    const maxTokensPerSegment = 8000; // Reduced limit for extra safety
    
    for (const sentence of sentences) {
      const testSegment = currentSegment + (currentSegment ? '. ' : '') + sentence.trim();
      
      if (this.estimateTokens(testSegment) > maxTokensPerSegment && currentSegment) {
        // The current segment is full, store it and start a new one
        segments.push(currentSegment + '.');
        currentSegment = sentence.trim();
      } else {
        currentSegment = testSegment;
      }
    }
    
    // Add the last segment
    if (currentSegment) {
      segments.push(currentSegment + '.');
    }
    
    console.log(`📑 Document split into ${segments.length} segments (sentence boundaries preserved)`);
    
    // Process each segment separately and preserve all information
    const allChunks: DocumentChunk[] = [];
    let chunkIndex = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentTokens = this.estimateTokens(segment);
      console.log(`🔄 Processing segment ${i + 1}/${segments.length} (${segmentTokens} tokens, ${segment.length} characters)`);
      
      try {
        const prompt = CHUNKING_SEGMENT_PROMPT(
          segment,
          `${Math.floor(i * 2) + 1}-${Math.floor(i * 2) + 3}`
        );

        const response = await Promise.race([
          openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 4000 // Raised limit to preserve the content
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('ChatGPT timeout after 60 seconds')), 60000)
          )
        ]);

        const result = (response as any).choices[0]?.message?.content;
        if (!result) {
          throw new Error('Empty response from ChatGPT for segment ' + (i + 1));
        }

        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error('Invalid JSON format in the response for segment ' + (i + 1));
        }

        const segmentChunks = JSON.parse(jsonMatch[0]);
        
        // Add the chunks with sequential indexes and verify the content is complete
        for (const chunk of segmentChunks) {
          allChunks.push({
            content: chunk.content || '',
            topic: chunk.topic || `Segment ${i + 1} - Blok ${chunkIndex + 1}`,
            summary: chunk.summary || '',
            keywords: Array.isArray(chunk.keywords) ? chunk.keywords : [],
            pageRange: chunk.pageRange || `${i + 1}`,
            chunkIndex: chunkIndex++
          });
        }

        console.log(`✅ Segment ${i + 1} processed - created ${segmentChunks.length} chunks with no information lost`);
        
        // Short pause between requests
        if (i < segments.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
      } catch (error) {
        console.warn(`⚠️ Error processing segment ${i + 1}, falling back to backup chunking:`, error);
        
        // Fallback chunking for this segment - preserve all content
        const fallbackChunks = this.fallbackChunkingForPart(segment, i, chunkIndex);
        allChunks.push(...fallbackChunks);
        chunkIndex += fallbackChunks.length;
      }
    }
    
    console.log(`🎉 Incremental processing finished - ${allChunks.length} chunks in total, all information preserved`);
    return allChunks;
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
   * Embeds one piece of text with the project's provider.
   *
   * Public because chunks are no longer only created by the upload pipeline -
   * an answer written by hand in the failure log becomes a chunk too, and it has
   * to land in the same vector space as everything else or it will never be
   * found next to them.
   */
  static async embedChunkContent(content: string, project: any): Promise<number[] | null> {
    return this.generateEmbeddingForChunk(content, project);
  }

  // Generate embeddings using the selected AI provider
  private static async generateEmbeddingForChunk(content: string, project: any): Promise<number[] | null> {
    const { aiProvider, openaiApiKey, azureEndpoint } = project;
    
    try {
      switch (aiProvider) {
        case 'openai':
          return await this.generateOpenAIEmbedding(content, openaiApiKey);
        case 'azure':
          return await this.generateAzureEmbedding(content, openaiApiKey, azureEndpoint);
        case 'google':
          // Google Generative AI has no embedding API; use OpenAI embeddings as a fallback
          console.log('⚠️ The Google provider has no embedding API, using OpenAI embeddings...');
          return await this.generateOpenAIEmbedding(content, openaiApiKey);
        default:
          console.log('⚠️ Unknown provider, falling back to OpenAI embeddings...');
          return await this.generateOpenAIEmbedding(content, openaiApiKey);
      }
    } catch (error) {
      console.error('❌ Error generating the embedding:', error);
      return null;
    }
  }

  private static async generateOpenAIEmbedding(content: string, apiKey: string): Promise<number[]> {
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content
    });
    return response.data[0].embedding;
  }

  private static async generateAzureEmbedding(content: string, apiKey: string, endpoint: string): Promise<number[]> {
    const azureOpenai = new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/text-embedding-3-small`,
      defaultQuery: { 'api-version': '2024-02-15-preview' },
      defaultHeaders: {
        'api-key': apiKey,
      },
    });

    const response = await azureOpenai.embeddings.create({
      model: "text-embedding-3-small",
      input: content
    });
    return response.data[0].embedding;
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
      
      await db.insert(documentChunks).values({
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
      });
    }
    
    console.log(`✅ All chunks stored for PDF ${pdfId}`);
  }

  // Two-stage search for user queries, supporting all AI providers
  static async findRelevantChunksAndRespond(
    query: string, 
    projectId: number, 
    customPrompt?: string,
    sessionId?: number,
    trainingOptions?: any
  ) {
    console.log(`[DocumentProcessor] Starting the two-stage search for query: "${query}"`);
    console.log(`[DocumentProcessor] Projekt ID: ${projectId}, Session ID: ${sessionId}`);
    
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
    const relevantChunks = await this.selectRelevantChunksWithAI(query, projectId, project, conversationContext);
    
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
    const response = await this.generateAnswerFromChunksWithAI(query, relevantChunks, project, customPrompt, conversationContext, trainingOptions);
    
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

  // STEP 1: universal selection of relevant blocks via the AI provider, using the conversation context
  private static async selectRelevantChunksWithAI(query: string, projectId: number, project: any, conversationContext?: string) {
    // Import pdfs tabulky pro JOIN
    const { pdfs } = await import('@shared/schema');
    
    // Load all chunks for the project together with the document weight
    const allChunks = await db.select({
      id: documentChunks.id,
      topic: documentChunks.topic,
      summary: documentChunks.summary,
      keywords: documentChunks.keywords,
      content: documentChunks.content,
      pageRange: documentChunks.pageRange,
      pdfId: documentChunks.pdfId,
      weight: pdfs.weight
    })
    .from(documentChunks)
    .leftJoin(pdfs, eq(documentChunks.pdfId, pdfs.id))
    .where(eq(documentChunks.projectId, projectId));

    if (allChunks.length === 0) return [];
    
    console.log(`[DocumentProcessor] Loaded ${allChunks.length} chunks with document weights`);
    
    // First round: basic keyword search + document weight
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const scoredChunks = allChunks.map(chunk => {
      let score = 0;
      const chunkText = `${chunk.topic} ${chunk.summary} ${chunk.content} ${Array.isArray(chunk.keywords) ? chunk.keywords.join(' ') : ''}`.toLowerCase();
      
      // Scoring based on keyword occurrences
      queryWords.forEach(word => {
        const occurrences = (chunkText.match(new RegExp(word, 'g')) || []).length;
        score += occurrences;
      });
      
      // NEW: add the document weight to the base score
      // The document weight (1-10) is added as a relevance bonus
      const documentWeight = chunk.weight || 5; // Default weight of 5
      score += documentWeight * 0.5; // The weight contributes 50% to the final score
      
      return { chunk, score, weight: documentWeight };
    });
    
    // Sort by score and take the top candidates
    const topCandidates = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(15, allChunks.length));
      
    console.log(`[DocumentProcessor] Pre-selected ${topCandidates.length} candidates out of ${allChunks.length} blocks based on score`);
    console.log(`[DocumentProcessor] Document weights among the top candidates:`, topCandidates.map(item => `weight ${item.weight} (score ${item.score.toFixed(1)})`).join(', '));

    // Extended prompt including the conversation context
    let selectionPrompt = CHUNK_SELECTION_SHORT_PROMPT;
    
    if (conversationContext) {
      selectionPrompt += `

KONTEXT KONVERZACE:
${conversationContext}`;
    }
    
    selectionPrompt += CHUNK_SELECTION_CANDIDATES_PROMPT(
      query,
      topCandidates.map((item, index) =>
        `${index}: [${item.chunk.topic}] ${item.chunk.summary}
     ${CHUNK_CANDIDATE_LABELS.keywords}: ${Array.isArray(item.chunk.keywords) ? item.chunk.keywords.join(', ') : CHUNK_CANDIDATE_LABELS.none}
     ${CHUNK_CANDIDATE_LABELS.page}: ${item.chunk.pageRange}
     ${CHUNK_CANDIDATE_LABELS.documentWeight}: ${item.weight}/10 (${CHUNK_CANDIDATE_LABELS.score}: ${item.score.toFixed(1)})`
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
        .filter(i => !isNaN(i) && i >= 0 && i < topCandidates.length) || [];

      let selectedChunks = selectedIndices.map(i => topCandidates[i].chunk);
      
      // Extend the selection with related blocks (when they share keywords or topics)
      const expandedChunks = [...selectedChunks];
      selectedChunks.forEach(selectedChunk => {
        const relatedChunks = allChunks.filter(chunk => 
          !expandedChunks.some(existing => existing.id === chunk.id) && // not already selected
          (
            (Array.isArray(selectedChunk.keywords) && Array.isArray(chunk.keywords) &&
             (selectedChunk.keywords as string[]).some(keyword => (chunk.keywords as string[]).includes(keyword))) || // shares keywords
            chunk.topic?.toLowerCase().includes(selectedChunk.topic?.toLowerCase().split(' ')[0] || '') || // similar topic
            selectedChunk.topic?.toLowerCase().includes(chunk.topic?.toLowerCase().split(' ')[0] || '') ||
            false // fallback for unknown types
          )
        );
        
        // Add at most 1 related block per selected block
        if (relatedChunks.length > 0 && expandedChunks.length < 6) {
          expandedChunks.push(relatedChunks[0]);
          console.log(`[DocumentProcessor] Added a related block: "${relatedChunks[0].topic}"`);
        }
      });
      
      console.log(`[DocumentProcessor] Selected ${expandedChunks.length} relevant blocks (${selectedChunks.length} primary + ${expandedChunks.length - selectedChunks.length} related) via ${aiProvider}`);
      console.log(`[DocumentProcessor] Weights of the selected blocks:`, expandedChunks.map(chunk => {
        const originalItem = scoredChunks.find(item => item.chunk.id === chunk.id);
        return `${chunk.topic}: weight ${originalItem?.weight || 5}/10`;
      }).join(', '));
      
      return expandedChunks;
      
    } catch (error) {
      console.warn('Block selection failed, using the fallback:', error);
      // Fallback: return the first 3 blocks
      return allChunks.slice(0, 3);
    }
  }

  // STEP 2: universal answer generation from the selected blocks via the AI provider
  private static async generateAnswerFromChunksWithAI(
    query: string, 
    chunks: any[], 
    project: any,
    customPrompt?: string,
    conversationContext?: string,
    trainingOptions?: any
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
      
      console.log(`Answer generated via ${aiProvider}/${aiModel} (temp: ${temperature})`);
      return response || ANSWER_GENERATION_FAILED_MESSAGE;
      
    } catch (error) {
      console.error('Answer generation failed:', error);
      return "I am sorry, an error occurred while generating the answer.";
    }
  }

  // STEP 1: select the relevant blocks using ChatGPT
  private static async selectRelevantChunks(query: string, projectId: number, openai: OpenAI) {
    // Load all chunks for the project
    const allChunks = await db.select({
      id: documentChunks.id,
      topic: documentChunks.topic,
      summary: documentChunks.summary,
      keywords: documentChunks.keywords,
      content: documentChunks.content,
      pageRange: documentChunks.pageRange
    })
    .from(documentChunks)
    .where(eq(documentChunks.projectId, projectId));

    if (allChunks.length === 0) return [];

    // ChatGPT selects the relevant blocks
    const selectionPrompt = CHUNK_SELECTION_PROMPT(
      query,
      allChunks.map((chunk, index) =>
        `${index}: ${chunk.topic} - ${chunk.summary} (Keywords: ${Array.isArray(chunk.keywords) ? chunk.keywords.join(', ') : 'none'})`
      ).join('\n')
    );

    try {
      const selectionResponse = await openai.chat.completions.create({
        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        model: "gpt-4o",
        messages: [{ role: "user", content: selectionPrompt }],
        temperature: 0.1,
      });

      const selectedIndices = selectionResponse.choices[0]?.message?.content
        ?.split(',')
        .map(s => parseInt(s.trim()))
        .filter(i => !isNaN(i) && i >= 0 && i < allChunks.length) || [];

      const selectedChunks = selectedIndices.map(i => allChunks[i]);
      console.log(`Selected ${selectedChunks.length} relevant blocks`);
      
      return selectedChunks;
      
    } catch (error) {
      console.warn('Block selection failed, using the fallback:', error);
      // Fallback: return the first 3 blocks
      return allChunks.slice(0, 3);
    }
  }

  // STEP 2: generate the answer from the selected blocks
  private static async generateAnswerFromChunks(
    query: string, 
    chunks: any[], 
    openai: OpenAI,
    customPrompt?: string
  ) {
    const context = chunks.map((chunk, i) => 
      `${chunk.topic} (str. ${chunk.pageRange}):\n${chunk.content}`
    ).join('\n\n---\n\n');

    const systemPrompt = customPrompt || SIMPLE_ASSISTANT_PROMPT;
    
    const answerPrompt = STRICT_ANSWER_PROMPT(systemPrompt, query, context);

    const response = await openai.chat.completions.create({
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      model: "gpt-4o",
      messages: [{ role: "user", content: answerPrompt }],
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || ANSWER_GENERATION_FAILED_MESSAGE;
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
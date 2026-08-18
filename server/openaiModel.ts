/**
 * Module for communicating with the OpenAI API
 * 
 * This module provides functions for generating answers using the OpenAI API
 * and API key validation
 */

import { CONCISE_ASSISTANT_PROMPT, DOCUMENT_QA_PROMPT, GENERAL_ASSISTANT_PROMPT, CONVERSATIONAL_ASSISTANT_PROMPT, DOCUMENT_CONTEXT_LABELS } from './prompts';
import { recordUsage, tokensFromOpenAI, tokensFromGoogle } from "./services/usage";
import OpenAI from 'openai';

// Custom types for the OpenAI API that are compatible with their interface
type ChatRole = 'system' | 'user' | 'assistant';
type ChatMessage = {
  role: ChatRole;
  content: string;
};

// Global OpenAI API client instance using the default API key
let openaiClient: OpenAI | null = null;

/**
 * Creates a new OpenAI client instance with the given API key
 * @param apiKey OpenAI API key (optional, otherwise the env variable is used)
 * @returns Instance OpenAI klienta
 */
export function createOpenAIClient(apiKey?: string): OpenAI {
  // If an API key is provided use it, otherwise use the env variable
  let key = apiKey || process.env.OPENAI_API_KEY;
  
  if (!key) {
    throw new Error('No OpenAI API key available. Set OPENAI_API_KEY or pass apiKey.');
  }
  
  // Verify that the API key has the correct format
  if (!isValidOpenAIKeyFormat(key)) {
    console.warn('Detected an API key in the wrong format (it should start with "sk-" or "sk-proj-")');
    key = process.env.OPENAI_API_KEY;
    if (!key || !isValidOpenAIKeyFormat(key)) {
      throw new Error('The global OpenAI API key is unavailable or has the wrong format');
    }
  }
  
  // Special configuration for project API keys
  if (key.startsWith('sk-proj-')) {
    console.log('Detected an OpenAI project API key, using the special configuration');
    
    // For project keys we use OpenAI without setting the organisation
    // Project keys already carry the project/organisation information
    console.log('Using the OpenAI project key without explicitly setting the organisation');
    return new OpenAI({
      apiKey: key,
      // We do not specify the organisation because the project key already carries it
    });
  }
  
  // Standard API key
  return new OpenAI({ apiKey: key });
}

/**
 * Returns the existing OpenAI client instance or creates a new one
 * @param apiKey Optional API key - if provided, creates a new instance
 * @returns Instance OpenAI klienta
 */
export function getOpenAIClient(apiKey?: string): OpenAI {
  if (apiKey) {
    // If a specific API key is provided, create a temporary instance
    return createOpenAIClient(apiKey);
  }
  
  // If no API key is provided and the global client does not exist, create it
  if (!openaiClient) {
    openaiClient = createOpenAIClient();
  }
  
  return openaiClient;
}

/**
 * Verifies that the OpenAI API key has the correct format
 * Valid formats are for example 'sk-abcdefg1234567890' (starting with 'sk-')
 * or 'sk-proj-abcdefg1234567890' (project API keys)
 * @param apiKey API key to verify
 * @returns true if the key has the correct format, otherwise false
 */
export function isValidOpenAIKeyFormat(apiKey: string): boolean {
  if (!apiKey) return false;
  // An OpenAI key should start with 'sk-' (including project keys 'sk-proj-')
  return apiKey.startsWith('sk-');
}

/**
 * Verifies an OpenAI API key by attempting an API call
 * @param apiKey API key to verify
 * @returns true if the key is valid, otherwise false
 */
export async function verifyOpenAIKey(apiKey: string): Promise<boolean> {
  if (!isValidOpenAIKeyFormat(apiKey)) {
    console.warn('The API key does not have a valid OpenAI format (it should start with "sk-" or "sk-proj-")');
    return false;
  }
  
  try {
    if (!apiKey || apiKey.trim() === '') {
      return false;
    }
    
    // Create a temporary client with the given API key
    const client = createOpenAIClient(apiKey);
    
    // Try a simple API operation - listing the models
    await client.models.list();
    
    // If no error occurred, the key is valid
    return true;
  } catch (error: any) {
    console.error('Error verifying the OpenAI API key:', error.message);
    return false;
  }
}

/**
 * Generates text using the OpenAI API
 * @param prompt Text promptu
 * @param apiKey Optional API key (used instead of the env variable)
 * @param options Optional generation parameters
 * @returns The generated text
 */
export async function generateOpenAIText(
  prompt: string,
  apiKey?: string,
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    systemPrompt?: string;
  } = {}
): Promise<string> {
  try {
    // Obtain the OpenAI client
    const client = getOpenAIClient(apiKey);
    
    // Default parameter values
    const model = options.model || 'gpt-3.5-turbo';  // Changed from 'gpt-4o' to 'gpt-3.5-turbo' for a better price/performance ratio
    const temperature = options.temperature !== undefined ? options.temperature : 0.7;
    const maxTokens = options.max_tokens || 1024;
    
    // Build the messages for the chat completion
    const messages: ChatMessage[] = [];
    
    // Add the system prompt, if one was provided
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    
    // Add the user prompt
    messages.push({
      role: 'user',
      content: prompt
    });
    
    // Call the chat completion API
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    
    // Return the generated text
    await recordUsage({
      provider: 'openai',
      model: response.model || 'unknown',
      kind: 'conversation',
      tokens: tokensFromOpenAI(response),
    });

    return response.choices[0].message.content || '';
  } catch (error: any) {
    console.error('Error generating text via the OpenAI API:', error.message);
    throw new Error(`Failed to generate text: ${error.message}`);
  }
}

/**
 * Generates an answer to a conversational query using the OpenAI API
 * @param message User message
 * @param chatHistory Conversation history (optional)
 * @param apiKey Optional API key (used instead of the env variable)
 * @param customSystemPrompt Optional custom system prompt
 * @returns The generated answer
 */
export async function generateOpenAIConversationalResponse(
  message: string,
  chatHistory: { role: 'user' | 'assistant', content: string }[] = [],
  apiKey?: string,
  customSystemPrompt?: string
): Promise<string> {
  try {
    // Obtain the OpenAI client
    const client = getOpenAIClient(apiKey);
    
    // Log which type of API key is being used
    if (apiKey) {
      if (apiKey.startsWith('sk-proj-')) {
        console.log('Using the project API key to generate a conversational answer');
      } else {
        console.log('Using the standard API key to generate a conversational answer');
      }
    } else {
      console.log('Using the global OpenAI API key to generate a conversational answer');
    }
    
    // Default system prompt
    const systemPrompt = customSystemPrompt || 
      CONCISE_ASSISTANT_PROMPT;
    
    // Build the messages for the chat completion
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add the conversation history (up to the last 6 messages to preserve context)
    const recentHistory = chatHistory.slice(-6);
    messages.push(...recentHistory);
    
    // Add the current user message
    messages.push({ role: 'user', content: message });
    
    // Call the chat completion API
    const response = await client.chat.completions.create({
      model: 'gpt-3.5-turbo', // Changed from 'gpt-4o' to 'gpt-3.5-turbo' for a better price/performance ratio
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });
    
    // Return the generated answer
    await recordUsage({
      provider: 'openai',
      model: response.model || 'unknown',
      kind: 'conversation',
      tokens: tokensFromOpenAI(response),
    });

    return response.choices[0].message.content || '';
  } catch (error: any) {
    console.error('Error generating a conversational answer via the OpenAI API:', error.message);
    throw new Error(`Failed to generate an answer: ${error.message}`);
  }
}

/**
 * Generates an answer to a query using context from documents
 * @param query User query
 * @param documents Dokumenty jako kontext
 * @param apiKey Optional API key (used instead of the env variable)
 * @param options Optional generation parameters
 * @returns The generated answer
 */
export async function generateOpenAIResponseWithDocuments(
  query: string,
  documents: string[],
  apiKey?: string,
  options: {
    model?: string;
    temperature?: number;
    customPrompt?: string;
  } = {}
): Promise<string> {
  try {
    // Obtain the OpenAI client
    const client = getOpenAIClient(apiKey);
    
    // Default parameter values
    const model = options.model || 'gpt-3.5-turbo';  // Changed from 'gpt-4o' to 'gpt-3.5-turbo' for a better price/performance ratio
    const temperature = options.temperature !== undefined ? options.temperature : 0.5;
    
    // Build the context from the documents
    const context = documents.join('\n\n');
    
    // Default prompt template
    const defaultPrompt = DOCUMENT_QA_PROMPT;
    
    // Using the custom prompt or the default one
    const systemPrompt = options.customPrompt || defaultPrompt;
    
    // Build the messages for the chat completion
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { 
        role: 'user', 
        content: `${DOCUMENT_CONTEXT_LABELS.question}: ${query}\n\n${DOCUMENT_CONTEXT_LABELS.contextFromDocuments}:\n${context}`
      }
    ];
    
    // Call the chat completion API
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: 1500,
    });
    
    // Return the generated answer
    await recordUsage({
      provider: 'openai',
      model: response.model || 'unknown',
      kind: 'conversation',
      tokens: tokensFromOpenAI(response),
    });

    return response.choices[0].message.content || '';
  } catch (error: any) {
    console.error('Error generating a document-based answer via the OpenAI API:', error.message);
    throw new Error(`Failed to generate an answer: ${error.message}`);
  }
}

/**
 * Testuje dostupnost OpenAI API
 * @param apiKey Optional API key to test
 * @returns Information about the test result
 */
export async function testOpenAIAPI(apiKey?: string): Promise<{ success: boolean; message: string }> {
  try {
    // Create a test client
    const client = getOpenAIClient(apiKey);
    
    // List the models as a test API call
    await client.models.list();
    
    return {
      success: true,
      message: 'The OpenAI API is reachable and working'
    };
  } catch (error: any) {
    console.error('Error testing the OpenAI API:', error.message);
    return {
      success: false,
      message: `The OpenAI API is unavailable: ${error.message}`
    };
  }
}

/**
 * Flexible AI answer generation with support for multiple providers
 * @param message User message
 * @param chatHistory Historie konverzace
 * @param config Konfigurace AI providera
 * @returns The generated answer
 */
export async function generateFlexibleAIResponse(
  message: string,
  chatHistory: { role: 'user' | 'assistant', content: string }[] = [],
  config: {
    provider: string;
    apiKey?: string;
    model?: string;
    azureEndpoint?: string;
    defaultPrompt?: string;
  }
): Promise<string> {
  try {
    const { provider, apiKey, model, azureEndpoint, defaultPrompt } = config;
    
    console.log(`[FLEXIBLE AI] Using the ${provider} provider with model ${model || 'default'}`);
    
    // Default system prompt
    const systemPrompt = defaultPrompt || 
      CONCISE_ASSISTANT_PROMPT;
    
    // Build the messages for the chat completion
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add the conversation history (up to the last 6 messages to preserve context)
    const recentHistory = chatHistory.slice(-6);
    messages.push(...recentHistory);
    
    // Add the current user message
    messages.push({ role: 'user', content: message });
    
    switch (provider) {
      case 'google':
        return await generateGoogleAIResponse(messages, apiKey, model);
        
      case 'azure':
        return await generateAzureAIResponse(messages, apiKey, model, azureEndpoint);
        
      case 'openai':
      default:
        return await generateOpenAIResponse(messages, apiKey, model);
    }
    
  } catch (error: any) {
    console.error(`[FLEXIBLE AI] Error generating an answer via ${config.provider}:`, error.message);
    throw new Error(`Failed to generate an answer via ${config.provider}: ${error.message}`);
  }
}

/**
 * Generates an answer using OpenAI
 */
async function generateOpenAIResponse(
  messages: ChatMessage[],
  apiKey?: string,
  model?: string
): Promise<string> {
  const client = getOpenAIClient(apiKey);
  
  const response = await client.chat.completions.create({
    model: model || 'gpt-4',
    messages,
    temperature: 0.7,
    max_tokens: 1024,
  });
  
  await recordUsage({
    provider: 'openai',
    model: response.model || 'unknown',
    kind: 'conversation',
    tokens: tokensFromOpenAI(response),
  });

  return response.choices[0].message.content || '';
}

/**
 * Generates an answer using Google AI
 */
async function generateGoogleAIResponse(
  messages: ChatMessage[],
  apiKey?: string,
  model?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('The Google API key is required');
  }
  
  // Convert the messages into Google's format
  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
  
  const lastMessage = messages[messages.length - 1].content;
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-pro'}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        ...history,
        {
          role: 'user',
          parts: [{ text: lastMessage }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Google AI API error: ${response.status}`);
  }
  
  const data = await response.json();

  await recordUsage({
    provider: 'google',
    model: model || 'gemini-pro',
    kind: 'conversation',
    tokens: tokensFromGoogle(data),
  });

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Generates an answer using Azure OpenAI
 */
async function generateAzureAIResponse(
  messages: ChatMessage[],
  apiKey?: string,
  model?: string,
  endpoint?: string
): Promise<string> {
  if (!apiKey || !endpoint) {
    throw new Error('The Azure API key and endpoint are required');
  }
  
  const deploymentName = model || 'gpt-4';
  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-05-15`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    })
  });
  
  if (!response.ok) {
    throw new Error(`Azure AI API error: ${response.status}`);
  }
  
  const data = await response.json();

  await recordUsage({
    provider: 'azure',
    model: deploymentName,
    kind: 'conversation',
    tokens: tokensFromOpenAI(data),
  });

  return data.choices?.[0]?.message?.content || '';
}

/**
 * Generates an answer in conversational mode using the OpenAI API
 * @param message User message
 * @param chatHistory Conversation history for context (optional)
 * @param options Optional parameters for generating the answer
 * @returns The generated answer
 */
export async function generateChatCompletion(
  message: string,
  chatHistory: { content: string; isFromUser: boolean }[] = [],
  options: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    customPrompt?: string;
  } = {}
): Promise<string> {
  try {
    // Obtain the OpenAI client
    const client = getOpenAIClient(options.apiKey);
    
    // Default parameter values
    const model = options.model || 'gpt-3.5-turbo';  // Changed from 'gpt-4o' to 'gpt-3.5-turbo' for a better price/performance ratio
    const temperature = options.temperature !== undefined ? options.temperature : 0.7;
    const systemPrompt = options.customPrompt || GENERAL_ASSISTANT_PROMPT;
    
    // Convert the conversation history into the format expected by the OpenAI API
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add the conversation history to the messages
    for (const msg of chatHistory) {
      messages.push({
        role: msg.isFromUser ? 'user' : 'assistant',
        content: msg.content
      });
    }
    
    // Add the current user message
    messages.push({ role: 'user', content: message });
    
    // Call the chat completion API
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: 1500,
    });
    
    // Return the generated answer
    await recordUsage({
      provider: 'openai',
      model: response.model || 'unknown',
      kind: 'conversation',
      tokens: tokensFromOpenAI(response),
    });

    return response.choices[0].message.content || '';
  } catch (error: any) {
    console.error('Error generating a conversational-mode answer via the OpenAI API:', error.message);
    
    // On error, return a user-friendly message
    return `I am sorry, I could not generate an answer. Please try again later or contact the application administrator.`;
  }
}

/**
 * Generates an answer in conversational mode using PDF documents as context
 * @param message User message
 * @param pdfContents Contents of the PDF documents (array of strings)
 * @param chatHistory Conversation history for context (optional)
 * @param options Optional parameters for generating the answer
 * @returns The generated answer
 */
export async function generateChatCompletionWithPDFs(
  message: string,
  pdfContents: string[],
  chatHistory: { content: string; isFromUser: boolean }[] = [],
  options: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    defaultPrompt?: string;
    projectId?: number; // Project ID used to access the PDF chunks
  } = {}
): Promise<string> {
  try {
    // Obtain the OpenAI client
    const client = getOpenAIClient(options.apiKey);
    
    // Default parameter values
    const model = options.model || 'gpt-3.5-turbo';  // Changed from 'gpt-4o' to 'gpt-3.5-turbo' for a better price/performance ratio
    const temperature = options.temperature !== undefined ? options.temperature : 0.7;
    
    // Base prompt with instructions - conversational and natural, with no mention of documents
    const basePrompt = options.defaultPrompt || CONVERSATIONAL_ASSISTANT_PROMPT;
    
    // Convert the conversation history into the format expected by the OpenAI API
    const messages: ChatMessage[] = [
      { role: 'system', content: basePrompt }
    ];
    
    // Add the conversation history to the messages (limited count to keep context manageable)
    // Take only the last 4 history messages so there is room for the document context
    const recentHistory = chatHistory.slice(-4);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.isFromUser ? 'user' : 'assistant',
        content: msg.content
      });
    }
    
    // Prepare the document context
    let documentContext = '';
    const MAX_CONTEXT_LENGTH = 10000; // Context length limit to avoid exceeding the token limit
    
    // Try to obtain context via semantic search when a project ID is available
    if (options.projectId) {
      try {
        // Semantic search functionality moved to documentProcessor
        const relevantChunks = [];
        // Functionality moved to services/documentProcessor
        
        // Semantic search functionality moved to services/documentProcessor
        if (false) {
          console.log(`Semantic search moved to documentProcessor`);
        }
      } catch (error) {
        console.warn('Could not obtain relevant context from semantic search:', error);
        // Continue with the standard approach if semantic search fails
      }
    }
    
    // Without context from semantic search, use the standard approach
    if (!documentContext || documentContext.trim() === '') {
      console.log('Using the standard approach for PDF context (whole documents)');
      
      // Join the document contents while limiting the total length
      for (const content of pdfContents) {
        if (documentContext.length + content.length <= MAX_CONTEXT_LENGTH) {
          documentContext += content + '\n\n---\n\n';
        } else {
          // If adding another document would exceed the limit, add only part of it
          const remainingLength = MAX_CONTEXT_LENGTH - documentContext.length;
          if (remainingLength > 100) { // At least 100 characters must remain for this to make sense
            documentContext += content.substring(0, remainingLength) + '... (document truncated)';
          }
          break;
        }
      }
    }
    
    // Add the current user message together with the document context
    // Adjusted format that fully hides where the information came from
    const userPrompt = `${message}`;
    
    // Add the context as a separate system message so the user message stays clean
    messages.push({ 
      role: 'system', 
      content: `IMPORTANT: NEVER mention documents, context, files, PDFs, or any other information sources. Answer as if all the information were part of your own knowledge. For context: ${documentContext}`
    });
    
    messages.push({ role: 'user', content: userPrompt });
    
    // Call the chat completion API
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: 1500,
    });
    
    // Return the generated answer
    await recordUsage({
      provider: 'openai',
      model: response.model || 'unknown',
      kind: 'conversation',
      tokens: tokensFromOpenAI(response),
    });

    return response.choices[0].message.content || '';
  } catch (error: any) {
    console.error('Error generating an answer with PDF context via the OpenAI API:', error.message);
    
    // On error, return a user-friendly message
    return `I am sorry, but I do not know the answer to that.`;
  }
}

/**
 * Generates an answer in conversational mode using semantic search over PDF documents
 * @param message User message
 * @param projectId Project ID used to search the PDF chunks
 * @param chatHistory Conversation history (kept for backward compatibility;
 *   the conversation context is loaded by DocumentProcessor itself from `options.sessionId`)
 * @param options Optional parameters for generating the answer
 * @returns The generated answer
 */
export async function generateChatCompletionWithSemanticSearch(
  message: string,
  projectId: number,
  chatHistory: { content: string; isFromUser: boolean }[] = [],
  options: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    defaultPrompt?: string;
    /** Chat session ID – allows continuing from previous conversation messages. */
    sessionId?: number;
  } = {}
): Promise<string> {
  try {
    // Semantic search over chunks lives in DocumentProcessor – it loads the
    // project settings (AI provider, model, temperature) and builds the context
    // from the most relevant parts of the documents. Here we only delegate and keep
    // the original signature for the callers (embed chat, public API).
    const { DocumentProcessor } = await import('./services/documentProcessor');

    const result = await DocumentProcessor.findRelevantChunksAndRespond(
      message,
      projectId,
      options.defaultPrompt,
      options.sessionId,
      options.temperature !== undefined
        ? { temperatureValue: Math.round(options.temperature * 10) }
        : undefined
    );

    console.log(
      `[SemanticSearch] Answer for project ${projectId} generated from ${result.chunksUsed} chunks (${result.tokensUsed} tokens)`
    );

    return result.response || 'I am sorry, but I do not know the answer to that.';
  } catch (error: any) {
    console.error('Error generating an answer via semantic search:', error.message);
    return `I am sorry, but I do not know the answer to that.`;
  }
}
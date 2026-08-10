// File implementing the API endpoints for OpenAI and other integrations
import { Router, Request, Response } from "express";
import { verifyOpenAIKey, generateOpenAIText, generateOpenAIResponseWithDocuments } from "./openaiModel";

const apiRouter = Router();

// Endpoint for verifying an OpenAI API key
apiRouter.post('/verify-openai-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'No API key was provided' 
      });
    }
    
    // Verify that the API key is valid
    const isValid = await verifyOpenAIKey(apiKey);
    
    if (isValid) {
      return res.json({ 
        success: true, 
        message: 'The API key is valid' 
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid API key' 
      });
    }
  } catch (error: any) {
    console.error('Error verifying the OpenAI API key:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error verifying the API key',
      error: error.message 
    });
  }
});

// Endpoint for generating an answer via OpenAI
apiRouter.post('/generate-response', async (req: Request, res: Response) => {
  try {
    const { prompt, apiKey, model = 'gpt-4o', systemPrompt = '', maxTokens = 500 } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt nebyl poskytnut' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'No API key was provided' });
    }
    
    // Use the text generation function
    const generatedText = await generateOpenAIText(prompt, apiKey, {
      model,
      systemPrompt,
      max_tokens: maxTokens
    });
    
    return res.json({ 
      success: true, 
      content: generatedText
    });
  } catch (error: any) {
    console.error('Error generating the answer:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating the answer',
      error: error.message 
    });
  }
});

// Endpoint for generating embeddings via OpenAI
apiRouter.post('/generate-embedding', async (req: Request, res: Response) => {
  try {
    const { text, apiKey, model = 'text-embedding-ada-002' } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text nebyl poskytnut' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ success: false, message: 'No API key was provided' });
    }
    
    // Create an OpenAI client with the given API key
    const { getOpenAIClient } = await import('./openaiModel');
    const client = getOpenAIClient(apiKey);
    
    // Vygenerujeme embedding
    const response = await client.embeddings.create({
      model,
      input: text
    });
    
    return res.json({ 
      success: true, 
      embedding: response.data[0].embedding,
      usage: response.usage
    });
  } catch (error: any) {
    console.error('Error generating the embedding:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating the embedding',
      error: error.message 
    });
  }
});

// Exportujeme router
export default apiRouter;
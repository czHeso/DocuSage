import { CONVERSATIONAL_ASSISTANT_PROMPT, SIMPLE_ASSISTANT_PROMPT } from './prompts';
// Implementation of the public API endpoints for the embedded chat
import { Router, Request, Response } from "express";
import { storage } from "./storage";
import { nanoid } from "nanoid";

const publicApiRouter = Router();

// Endpoint for retrieving project information (for embedding)
publicApiRouter.get('/p/:id/info', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id);
    
    // Verify the project by ID
    const project = await storage.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Projekt nebyl nalezen' 
      });
    }
    
    // Return basic project information (without sensitive data)
    res.json({
      id: project.id,
      name: project.name,
      colorTheme: project.colorTheme || 'blue',
      chatbotName: project.chatbotName || 'Asistent',
      welcomeMessage: project.welcomeMessage || 'Ahoj, jak ti mohu pomoci?',
      notificationEnabled: project.notificationEnabled || false,
      notificationDelay: project.notificationDelay || 15,
      notificationText: project.notificationText || 'Need help with anything?'
    });
  } catch (error: any) {
    console.error('Error retrieving project information:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Endpoint for public chatting without login (via the embed snippet)
publicApiRouter.post('/p/:id/chat', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.id);
    const { message, sessionId, apiKey } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false, 
        message: 'No message was provided' 
      });
    }
    
    // Verify the project by ID
    const project = await storage.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Projekt nebyl nalezen' 
      });
    }
    
    // Verify the API key, if one was provided
    if (apiKey && project.apiKey && apiKey !== project.apiKey) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid API key' 
      });
    }
    
    let chatSessionId = sessionId;
    
    // Without a sessionId, create a new session
    if (!chatSessionId) {
      const newSession = await storage.createChatSession({
        projectId: project.id,
        visitorId: `embed_${nanoid(8)}`,
      });
      chatSessionId = newSession.id;
    } else {
      // Update the existing session
      await storage.updateChatSession(parseInt(chatSessionId.toString()), {});
    }
    
    // Use our conversational AI model to generate the answer
    console.log(`Public API chat session: ${chatSessionId} - Using AI model`);
    
    // Load the chat history for better answer context
    const chatHistory = await storage.getChatMessages(parseInt(chatSessionId.toString()));
    
    // Determine which AI model to use for this project
    let aiResponse;
    
    // Determine whether the project has its own OpenAI key
    if (project.openaiApiKey) {
      // Load the PDF documents for context
      const pdfs = await storage.getPdfs(project.id);
      
      if (pdfs.length > 0) {
        // Check whether PDF chunks exist for semantic search
        const pdfChunks = await storage.getProjectPdfChunks(project.id);
        
        if (pdfChunks && pdfChunks.length > 0) {
          // Use semantic search for relevant answers
          console.log(`Using the OpenAI API with semantic search for the public API of project ${project.id} (${pdfChunks.length} chunks)`);
          const { generateChatCompletionWithSemanticSearch } = await import('./openaiModel');
          
          // Generate an answer with context from the relevant parts of the PDF documents
          aiResponse = await generateChatCompletionWithSemanticSearch(
            message,
            project.id,
            chatHistory,
            {
              apiKey: project.openaiApiKey,
              defaultPrompt: project.defaultPrompt || CONVERSATIONAL_ASSISTANT_PROMPT,
              sessionId: parseInt(chatSessionId.toString())
            }
          );
        } else {
          // Fall back to the original method of processing whole PDF documents
          console.log(`Using the OpenAI API with PDF context for the public API of project ${project.id} (${pdfs.length} documents) - no PDF chunks available`);
          const { generateChatCompletionWithPDFs } = await import('./openaiModel');
          const pdfContents = pdfs.map(pdf => pdf.content);
          
          // Generate an answer with the PDF documents as context
          aiResponse = await generateChatCompletionWithPDFs(
            message,
            pdfContents,
            chatHistory,
            {
              apiKey: project.openaiApiKey,
              defaultPrompt: project.defaultPrompt || CONVERSATIONAL_ASSISTANT_PROMPT
            }
          );
        }
      } else {
        // With no PDF documents, use the standard chat
        console.log(`Using the OpenAI API (without PDF context) for the public API of project ${project.id}`);
        const { generateChatCompletion } = await import('./openaiModel');
        aiResponse = await generateChatCompletion(message, chatHistory, {
          apiKey: project.openaiApiKey,
          customPrompt: project.defaultPrompt || SIMPLE_ASSISTANT_PROMPT
        });
      }
    } else {
      // Fall back to the original model
      console.log(`Using the local model for the public API of project ${project.id}`);
      // Conversational AI functionality moved to services/documentProcessor
      aiResponse = "Conversational response disabled";
    }
    
    // Store the user's message in the database
    const userMessage = await storage.createChatMessage({
      sessionId: parseInt(chatSessionId.toString()),
      content: message,
      isFromUser: true,
    });
    
    // Universal detection of unsuccessful answers
    const { checkAndLogFailedResponse } = await import('./services/failureDetection');
    await checkAndLogFailedResponse(aiResponse, projectId, parseInt(chatSessionId.toString()), message);
    
    // Store the answer in the database
    const botMessage = await storage.createChatMessage({
      sessionId: parseInt(chatSessionId.toString()),
      content: aiResponse,
      isFromUser: false,
    });
    
    // API response
    return res.json({
      answer: aiResponse,
      sessionId: chatSessionId,
      message: botMessage
    });
  } catch (error: any) {
    console.error("Error in public chat API:", error);
    return res.status(500).json({
      message: "Error processing the chat: " + error.message,
    });
  }
});

export default publicApiRouter;
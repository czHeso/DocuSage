import { SIMPLE_ASSISTANT_PROMPT } from './prompts';
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { Project, pdfs, projects, chatSessions, chatMessages, ProjectTrainingOptions, users, apiCalls, ApiCall, documentChunks, failedResponses } from "@shared/schema";
import { verifyApiKey, apiCallLogger, generateApiKey } from './apiAuth';

// Project context extension is now in apiAuth.ts
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, debugSessionMiddleware, comparePasswords, requireAuth, toPublicUser } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "./db";
import { eq, count, and, sql, desc, gte, lt, inArray } from "drizzle-orm";
import { queryTopics } from "@shared/schema";
import { teamMembers } from "@shared/schema";
import { nanoid } from "nanoid";


/**
 * Verifies that the Azure OpenAI endpoint points to a real Azure service over HTTPS.
 *
 * The endpoint is supplied by the user and the server calls it itself. Without this
 * check, the application could be made to call internal addresses (cloud metadata,
 * services on a private network) – classic SSRF.
 */
function isAllowedAzureEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      (url.hostname.endsWith(".openai.azure.com") ||
        url.hostname.endsWith(".cognitiveservices.azure.com"))
    );
  } catch {
    return false;
  }
}

// Multer configuration for storing files by project ID
const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Treat the project ID as a number – if the parameter contained something like
    // "../..", path.join() would build a path outside the pdfs/ directory.
    const projectId = parseInt(req.params.id, 10);

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return cb(new Error("Invalid project ID"), "");
    }

    // Build the path to the project folder
    const projectDir = path.join("pdfs", String(projectId));

    // Make sure the project folder exists
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    cb(null, projectDir);
  },
  filename: function (req, file, cb) {
    // Generate a unique file name while keeping the original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExtension = path.extname(file.originalname);
    const safeFilename = file.originalname
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .substring(0, 50);
    cb(null, `${safeFilename}-${uniqueSuffix}${originalExtension}`);
  }
});

// Configure multer for PDF uploads
const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
  // Reject an unsuitable file before it is written to disk.
  fileFilter: function (req, file, cb) {
    const isPdfMime = file.mimetype === "application/pdf";
    const hasPdfExtension = path.extname(file.originalname).toLowerCase() === ".pdf";

    if (!isPdfMime || !hasPdfExtension) {
      return cb(new Error("Only PDF files can be uploaded"));
    }

    cb(null, true);
  },
});

// Configure multer for bot icon uploads
const iconStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create icons directory if it doesn't exist
    const iconsDir = path.join(process.cwd(), "icons");
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }
    cb(null, iconsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const originalExtension = path.extname(file.originalname);
    cb(null, `bot-icon-${uniqueSuffix}${originalExtension}`);
  }
});

const iconUpload = multer({
  storage: iconStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB limit for icons
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed as bot icons'));
    }
  }
});

// Middleware checking project quotas based on the user's role
async function checkProjectLimits(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({
      message: "User is not logged in",
    });
  }
  
  try {
    const { role } = req.user;
    
    // Get the current number of projects the user OWNS (not those they are merely a member of)
    const ownedProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, req.user!.id));
    
    const projectCount = ownedProjects.length;
    
    // Role-based limits
    let projectLimit = 0;
    
    switch (role) {
      case 'user': // Standard user
        projectLimit = 1;
        break;
      case 'vip': // VIP user
        projectLimit = 3; // Changed from 5 to 3 per the new pricing
        break;
      case 'unlimited': // Unlimited user
        projectLimit = 99;
        break;
      case 'admin': // Admin has the highest limits
        projectLimit = 999;
        break;
      default:
        projectLimit = 1; // Default value for an unknown role
    }
    
    // Kontrola limitu
    if (projectCount >= projectLimit) {
      return res.status(403).json({
        message: `You have reached the maximum number of projects (${projectLimit}) for your ${role} role. Upgrade your account to raise the limit.`,
        currentCount: projectCount,
        limit: projectLimit,
      });
    }
    
    // The limit has not been exceeded, continue
    next();
  } catch (error: any) {
    console.error("Error checking project limits:", error);
    return res.status(500).json({
      message: "Error checking the project quotas",
    });
  }
}

// Middleware checking PDF file quotas based on the user's role
async function checkPdfLimits(req: Request, res: Response, next: NextFunction) {
  if (!req.project) {
    return res.status(400).json({
      message: "Missing project context",
    });
  }
  
  try {
    const projectId = req.project!.id;
    const { role } = req.user!;
    
    // Get the current number of PDF files in the project
    const projectPdfs = await storage.getPdfs(projectId);
    const pdfCount = projectPdfs.length;
    
    // Role-based limits
    let pdfLimit = 0;
    
    switch (role) {
      case 'user': // Standard user
        pdfLimit = 3;
        break;
      case 'vip': // VIP user
        pdfLimit = 20;
        break;
      case 'unlimited': // Unlimited user
        pdfLimit = 100;
        break;
      case 'admin': // Admin has the highest limits
        pdfLimit = 999;
        break;
      default:
        pdfLimit = 3; // Default value for an unknown role
    }
    
    // Kontrola limitu
    if (pdfCount >= pdfLimit && pdfLimit !== Infinity) {
      return res.status(403).json({
        message: `You have reached the maximum number of PDF documents (${pdfLimit}) for this project. Upgrade your account to raise the limit.`,
        currentCount: pdfCount,
        limit: pdfLimit,
      });
    }
    
    // The limit has not been exceeded, continue
    next();
  } catch (error: any) {
    console.error("Error checking PDF limits:", error);
    return res.status(500).json({
      message: "Error checking the PDF document quotas",
    });
  }
}

// Middleware checking access to a project
async function checkProjectAccess(req: Request, res: Response, next: NextFunction) {
  // Extract project ID from request params
  const projectId = parseInt(req.params.projectId || req.params.id);
  
  console.log("checkProjectAccess - User:", req.user?.id, req.user?.username);
  console.log("checkProjectAccess - All params:", req.params);
  console.log("checkProjectAccess - Project ID from params:", projectId);
  
  if (isNaN(projectId)) {
    return res.status(400).json({
      message: "Invalid project ID",
    });
  }
  
  console.log("checkProjectAccess - Looking for project:", projectId);
  
  try {
    // Get project from storage
    const project = await storage.getProject(projectId);
    
    if (!project) {
      return res.status(404).json({
        message: "Projekt nebyl nalezen",
      });
    }
    
    // Check if user has access to the project
    if (!req.user) {
      return res.status(401).json({
        message: "Access denied - the user is not logged in",
      });
    }
    
    // Check if user is owner or team member
    if (project.ownerId === req.user!.id) {
      console.log("checkProjectAccess - User is owner");
      req.project = project;
      return next();
    }
    
    // Check if user is a team member
    const teamMember = await storage.getTeamMembers(projectId);
    const userTeamMember = teamMember.find((tm) => tm.userId === req.user?.id);
    
    if (userTeamMember) {
      console.log("checkProjectAccess - User is team member with role:", userTeamMember.role);
      req.project = project;
      return next();
    }
    
    // User does not have access to the project
    return res.status(403).json({
      message: "Access denied - you are neither the owner nor a team member of the project",
    });
  } catch (error: any) {
    console.error("Error checking project access:", error);
    return res.status(500).json({
      message: "An error occurred while verifying access to the project",
    });
  }
}

/**
 * Middleware checking access to a chat session, for routes where `:id` is a
 * chat session id rather than a project id.
 *
 * These routes used to use checkProjectAccess, which reads `:id` as a project
 * id. It therefore looked up the project whose id happened to equal the session
 * id — normally the wrong project, or none at all — so chat export answered 404
 * or 403 almost every time, and the authorisation that did run was for an
 * object other than the one being read.
 *
 * Resolves the session first, then authorises against the project it belongs to,
 * and puts both on the request.
 */
async function checkChatSessionAccess(req: Request, res: Response, next: NextFunction) {
  const sessionId = parseInt(req.params.id);

  if (isNaN(sessionId)) {
    return res.status(400).json({ message: "Invalid chat session ID" });
  }

  if (!req.user) {
    return res.status(401).json({ message: "Access denied - the user is not logged in" });
  }

  try {
    const [chatSession] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId));

    if (!chatSession) {
      return res.status(404).json({ message: "Chat session not found" });
    }

    const project = await storage.getProject(chatSession.projectId);

    if (!project) {
      return res.status(404).json({ message: "The project for this chat session no longer exists" });
    }

    const isOwner = project.ownerId === req.user.id;
    const isTeamMember = isOwner
      ? false
      : (await storage.getTeamMembers(project.id)).some((tm) => tm.userId === req.user?.id);

    if (!isOwner && !isTeamMember) {
      return res.status(403).json({ message: "You do not have access to this chat session" });
    }

    req.project = project;
    req.chatSession = chatSession;
    return next();
  } catch (error: any) {
    console.error("Error checking chat session access:", error);
    return res.status(500).json({
      message: "An error occurred while verifying access to the chat session",
    });
  }
}

// Function for setting up the API routers
export function setupApiRoutes(app: Express) {
  // Create the router for API calls
  const apiRouter = express.Router();
  
  // Apply the middleware for API key verification and logging
  apiRouter.use(verifyApiKey);
  apiRouter.use(apiCallLogger);
  
  // API endpoint for retrieving project information
  apiRouter.get('/info', async (req, res) => {
    try {
      // The project is already available in req.project thanks to the verifyApiKey middleware
      const projectInfo = {
        id: req.project!.id,
        name: req.project!.name,
        colorTheme: req.project!.colorTheme,
        createdAt: req.project!.createdAt,
        description: req.project!.name || "Bez popisu",
        pdfs: await storage.getPdfs(req.project!.id)
          .then(pdfs => pdfs.map(pdf => ({
            id: pdf.id,
            fileName: pdf.filename,
            uploadedAt: pdf.createdAt
          }))),
      };
      
      res.json({
        success: true,
        project: projectInfo
      });
    } catch (error: any) {
      console.error('Error retrieving project information:', error);
      res.status(500).json({
        success: false,
        error: 'An error occurred while processing the request'
      });
    }
  });
  
  // API endpoint pro chat
  apiRouter.post('/chat', async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'The message is required and must be a string'
        });
      }
      
      const projectId = req.project!.id;
      
      // Create a new chat session.
      // Only projectId and visitorId are columns of chat_sessions; visitorId is
      // NOT NULL. This call used to pass sessionId/userIdentifier/userIp/userAgent
      // instead – none of them are columns, so Drizzle dropped them and the insert
      // failed on the not-null constraint. It went unnoticed because an
      // unauthenticated duplicate route shadowed this handler entirely.
      const newSession = await storage.createChatSession({
        projectId,
        visitorId: `api_${nanoid(8)}`,
      });
      
      if (!newSession) {
        return res.status(500).json({
          success: false,
          error: 'The chat session could not be created'
        });
      }
      
      // Store the user's message in the database
      const userMessage = await storage.createChatMessage({
        sessionId: newSession.id,
        content: message,
        isFromUser: true
      });
      
      // Analyse the query topic and store statistics
      
      // Get the project's PDF files
      const pdfs = await storage.getPdfs(projectId);
      const pdfContents: Record<string, string> = {};
      
      // We use the text extracted at upload time (the content column),
      // the binary PDF on disk is never read directly.
      for (const pdf of pdfs) {
        if (pdf.content) {
          pdfContents[pdf.filename] = pdf.content;
        }
      }
      
      // Get the project settings including the prompt
      const trainingOptions = await storage.getTrainingOptions(projectId) || {
        customPromptTemplate: null,
        responseStyle: 'balanced'
      };
      
      let botResponse = '';
      let success = true;
      let error = null;
      
      try {
        // NEW TWO-STAGE CHATGPT SYSTEM
        console.log(`[API] OpenAI key check: ${req.project!.openaiApiKey ? 'PRESENT' : 'MISSING'}`);
        
        if (req.project!.openaiApiKey) {
          console.log(`[API] Using the NEW two-stage ChatGPT system`);
          const { DocumentProcessor } = await import('./services/documentProcessor');
          const result = await DocumentProcessor.findRelevantChunksAndRespond(
            message,
            projectId,
            trainingOptions.customPromptTemplate || undefined,
            newSession.id, // sessionId pro kontext konverzace
            trainingOptions // The whole trainingOptions object for advanced settings
          );
          
          botResponse = result.response;
          console.log(`[API] Answer generated from ${result.chunksUsed} chunks (${result.tokensUsed} tokens)`);
        } else {
          // Fall back to the legacy system when there is no OpenAI key
          console.log(`[API] Using the LEGACY system (no OpenAI key)`);
          const { openaiGenerateResponse } = await import('./ai/openaiService');
          botResponse = await openaiGenerateResponse(message, pdfContents, {
            responseStyle: trainingOptions.responseStyle || 'balanced',
            customPrompt: trainingOptions.customPromptTemplate,
            contextSize: trainingOptions.contextSize || 2000,
            temperature: (trainingOptions.temperatureValue || 5) / 10,
            useConversationalMode: false
          });
        }
      } catch (err: any) {
        console.error('Error generating the answer (the new system failed):', err);
        console.log(`[API] Falling back to the legacy system because of an error: ${err.message}`);
        
        // Fall back to the legacy system on error
        try {
          const { openaiGenerateResponse } = await import('./ai/openaiService');
          botResponse = await openaiGenerateResponse(message, pdfContents, {
            responseStyle: trainingOptions.responseStyle || 'balanced',
            customPrompt: trainingOptions.customPromptTemplate,
            contextSize: trainingOptions.contextSize || 2000,
            temperature: (trainingOptions.temperatureValue || 5) / 10,
            useConversationalMode: false
          });
        } catch (fallbackErr: any) {
          console.error('The fallback system failed as well:', fallbackErr);
          botResponse = 'I am sorry, I cannot process your question right now. Please try again later.';
          success = false;
          error = fallbackErr.message || 'Unknown error';
        }
      }
      
      // Universal detection of unsuccessful answers
      const { checkAndLogFailedResponse } = await import('./services/failureDetection');
      await checkAndLogFailedResponse(botResponse, projectId, newSession.id, message);
      
      // Store the bot's answer in the database
      await storage.createChatMessage({
        sessionId: newSession.id,
        content: botResponse,
        isFromUser: false
      });
      
      // Return the response
      res.json({
        success,
        response: botResponse,
        sessionId: newSession.id,
        error
      });
    } catch (error: any) {
      console.error('Error processing the chat request:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while processing the chat request'
      });
    }
  });
  
  // API endpoint for continuing a chat conversation
  apiRouter.post('/chat/:sessionId', async (req, res) => {
    try {
      const { message } = req.body;
      const { sessionId } = req.params;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'The message is required and must be a string'
        });
      }
      
      const projectId = req.project!.id;
      
      // Find the existing chat session
      const sessions = await db
        .select()
        .from(chatSessions)
        .where(and(
          eq(chatSessions.id, parseInt(sessionId)),
          eq(chatSessions.projectId, projectId)
        ));

      if (sessions.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Chat relace nebyla nalezena'
        });
      }

      const session = sessions[0];

      // Store the user's message in the database
      const userMessage = await storage.createChatMessage({
        sessionId: session.id,
        content: message,
        isFromUser: true
      });
      
      // Get the entire chat history
      const chatHistory = await storage.getChatMessages(session.id);
      
      // Get the project's PDF files
      const pdfs = await storage.getPdfs(projectId);
      const pdfContents: Record<string, string> = {};
      
      // We use the text extracted at upload time (the content column),
      // the binary PDF on disk is never read directly.
      for (const pdf of pdfs) {
        if (pdf.content) {
          pdfContents[pdf.filename] = pdf.content;
        }
      }
      
      // Get the project settings including the prompt
      const trainingOptions = await storage.getTrainingOptions(projectId) || {
        customPromptTemplate: null,
        responseStyle: 'balanced'
      };
      
      let botResponse = '';
      let success = true;
      let error = null;
      
      try {
        // NEW TWO-STAGE CHATGPT SYSTEM
        console.log(`[PROJECT CHAT] OpenAI key check: ${req.project!.openaiApiKey ? 'PRESENT' : 'MISSING'}`);
        console.log(`[PROJECT CHAT] Using the NEW two-stage ChatGPT system for project ${projectId}`);
        
        const { DocumentProcessor } = await import('./services/documentProcessor');
        const result = await DocumentProcessor.findRelevantChunksAndRespond(
          message,
          projectId,
          trainingOptions.customPromptTemplate || undefined,
          // Without the session id this branch loads no conversation history, so
          // the bot forgets the previous turn. The fallback branch below always
          // passed it, which made the chatbot behave worse once the documents
          // had been processed properly than before.
          session.id
        );

        botResponse = result.response;
        console.log(`[PROJECT CHAT] ✅ Answer generated from ${result.chunksUsed} chunks (${result.tokensUsed} tokens)`);
        
        // Fall back to the legacy system when there is no OpenAI key
        if (!botResponse || botResponse.includes('Test information is not in the documents')) {
          console.log('[PROJECT CHAT] Trying the fallback to the legacy system...');
          const { openaiGenerateResponse } = await import('./ai/openaiService');
          botResponse = await openaiGenerateResponse(message, pdfContents, {
            responseStyle: trainingOptions.responseStyle || 'balanced',
            customPrompt: trainingOptions.customPromptTemplate,
            contextSize: trainingOptions.contextSize || 2000,
            temperature: (trainingOptions.temperatureValue || 5) / 10,
            chatHistory,
            useConversationalMode: false
          });
        }
      } catch (err: any) {
        console.error('Error generating the answer:', err);
        botResponse = 'I am sorry, I cannot process your question right now. Please try again later.';
        success = false;
        error = err.message || 'Unknown error';
      }
      
      // Universal detection of unsuccessful answers
      const { checkAndLogFailedResponse } = await import('./services/failureDetection');
      await checkAndLogFailedResponse(botResponse, projectId, session.id, message);
      
      // Store the bot's answer in the database
      await storage.createChatMessage({
        sessionId: session.id,
        content: botResponse,
        isFromUser: false
      });
      
      // Return the response
      res.json({
        success,
        response: botResponse,
        sessionId,
        error
      });
    } catch (error: any) {
      console.error('Error processing the chat request:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while processing the chat request'
      });
    }
  });
  
  // API endpoint for retrieving chat history
  apiRouter.get('/chat/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const projectId = req.project!.id;
      
      // Find the existing chat session
      const sessions = await db
        .select()
        .from(chatSessions)
        .where(and(
          eq(chatSessions.id, parseInt(sessionId)),
          eq(chatSessions.projectId, projectId)
        ));

      if (sessions.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Chat relace nebyla nalezena'
        });
      }

      const session = sessions[0];

      // Get the chat history
      const chatHistory = await storage.getChatMessages(session.id);
      
      // Return the history
      res.json({
        success: true,
        sessionId,
        messages: chatHistory.map(msg => ({
          role: msg.isFromUser,
          content: msg.content,
          timestamp: msg.createdAt
        }))
      });
    } catch (error: any) {
      console.error('Error retrieving the chat history:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while retrieving the chat history'
      });
    }
  });

  // ============ NEW API ENDPOINTS FOR DOCUMENT MANAGEMENT ============
  
  // API endpoint for retrieving the document list
  apiRouter.get('/documents', async (req, res) => {
    try {
      const projectId = req.project!.id;
      
      // Get all of the project's PDF documents
      const documents = await storage.getPdfs(projectId);
      
      res.json({
        success: true,
        documents: documents.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          content: doc.content,
          totalPages: doc.totalPages,
          fileSize: doc.fileSize,
          processingStatus: doc.processingStatus,
          processingError: doc.processingError,
          createdAt: doc.createdAt,
          processedAt: doc.processedAt
        }))
      });
    } catch (error: any) {
      console.error('Error retrieving the document list:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while retrieving the documents'
      });
    }
  });

  // API endpoint for uploading a new document
  apiRouter.post('/documents', async (req, res) => {
    try {
      const { filename, content, totalPages, fileSize } = req.body;
      const projectId = req.project!.id;
      
      // Validate the required fields
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'The file name is required and must be a string'
        });
      }
      
      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'The document content is required and must be a string'
        });
      }
      
      // Create a new document
      const newDocument = await storage.createPdf({
        projectId,
        filename,
        content,
        totalPages: totalPages || null,
        fileSize: fileSize || null,
        processingStatus: 'completed', // API documents are already processed
        uploadedById: null, // API uploads have no specific user
        createdAt: new Date(),
        processedAt: new Date()
      });
      
      res.json({
        success: true,
        message: 'Document uploaded successfully',
        document: {
          id: newDocument.id,
          filename: newDocument.filename,
          content: newDocument.content,
          totalPages: newDocument.totalPages,
          fileSize: newDocument.fileSize,
          processingStatus: newDocument.processingStatus,
          createdAt: newDocument.createdAt,
          processedAt: newDocument.processedAt
        }
      });
    } catch (error: any) {
      console.error('Error uploading the document:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while uploading the document'
      });
    }
  });

  // API endpoint for deleting a document
  apiRouter.delete('/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const projectId = req.project!.id;
      
      // Validace ID dokumentu
      const docId = parseInt(documentId);
      if (isNaN(docId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid document ID'
        });
      }
      
      // Verify that the document belongs to this project
      const documents = await storage.getPdfs(projectId);
      const document = documents.find(doc => doc.id === docId);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'The document was not found, or does not belong to this project'
        });
      }
      
      // Delete the document
      await storage.deletePdf(docId);
      
      res.json({
        success: true,
        message: 'Document deleted successfully',
        deletedDocumentId: docId
      });
    } catch (error: any) {
      console.error('Error deleting the document:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'An error occurred while deleting the document'
      });
    }
  });
  
  // Registrujeme API pod /api/p/:projectId/ cestu
  app.use('/api/p/:projectId', (req, res, next) => {
    // Put projectId where the verifyApiKey middleware expects it
    req.params.id = req.params.projectId;
    next();
  }, apiRouter);
}

// Function for deleting old chats (older than 30 days)
async function deleteOldChatSessions() {
  try {
    console.log("Running the old chat cleanup job...");
    
    // Compute the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // First obtain the list of old chat sessions
    const oldSessions = await db
      .select()
      .from(chatSessions)
      .where(lt(chatSessions.createdAt, thirtyDaysAgo))
      .execute();
    
    if (oldSessions.length === 0) {
      console.log("No old chats to delete.");
      return;
    }
    
    console.log(`Found ${oldSessions.length} old chats to delete...`);
    
    // Get the IDs of all old sessions
    const sessionIds = oldSessions.map(session => session.id);
    
    // First delete all messages belonging to these sessions.
    // inArray() parameterises the values; hand-building `IN (${ids.join(',')})`
    // would also delete by message ID rather than session ID.
    const deleteMessagesResult = await db
      .delete(chatMessages)
      .where(inArray(chatMessages.sessionId, sessionIds))
      .execute();

    console.log(`Deleted ${deleteMessagesResult.rowCount || 0} old messages.`);

    // Then delete the chat sessions themselves
    const deleteSessionsResult = await db
      .delete(chatSessions)
      .where(inArray(chatSessions.id, sessionIds))
      .execute();
    
    console.log(`Deleted ${deleteSessionsResult.rowCount || 0} old chats.`);
  } catch (error: any) {
    console.error("Error deleting old chats:", error);
  }
}

export function registerRoutes(app: Express): Server {
  // Delete old chats now, then every 24 hours. The first run matters: with only
  // the interval, an instance that restarts more often than once a day – a
  // container that scales, or any redeploy – never ran the cleanup at all.
  // unref() keeps the timer from holding the process open on shutdown.
  deleteOldChatSessions().catch((error) =>
    console.error("Initial cleanup of old chats failed:", error),
  );
  setInterval(deleteOldChatSessions, 24 * 60 * 60 * 1000).unref();
  console.log("Scheduled periodic deletion of chats older than 30 days.");
  
  // API endpoints are already set up in index.ts
  
  // Set up the API endpoints for managing projects' API settings
  setupProjectApiRoutes(app);
  
  // Application API endpoints
  app.use(debugSessionMiddleware);
  
  // API pro debugging autentizace
  // Debug endpoint for troubleshooting login problems.
  // It returns the session ID and the whole user object, so it is available only outside
  // production and only to a logged-in user – and only about themselves.
  app.get("/api/debug-auth", (req, res) => {
    if (process.env.NODE_ENV === 'production' && process.env.DEBUG_AUTH !== 'true') {
      return res.status(404).json({ message: "Not found" });
    }

    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "User is not logged in" });
    }

    res.json({
      success: true,
      session: {
        authenticated: true,
      },
      user: toPublicUser(req.user),
    });
  });


  // API endpoint for creating a new user (admins only)
  app.post("/api/admin/users", async (req, res) => {
    try {
      // Verify that the user is an admin
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'You do not have administrator permissions' });
      }
      
      const { username, email, password, role } = req.body;
      
      // Validate the input data
      if (!username || !email || !password || !role) {
        return res.status(400).json({ message: 'All fields are required' });
      }
      
      // Check that the supplied role is valid
      if (!['user', 'vip', 'unlimited', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      
      // Create a new user
      const newUser = await storage.createUser({
        username,
        email,
        password,
        role,
        isActive: true
      });
      
      res.json({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt
      });
    } catch (error: any) {
      console.error('Error creating the user:', error);
      if (error.message && error.message.includes('duplicate key')) {
        res.status(400).json({ message: 'A user with this email or username already exists' });
      } else {
        res.status(500).json({ message: 'Error creating the user' });
      }
    }
  });

  // API for user management (admin)
  app.get("/api/admin/users", async (req, res) => {
    try {
      // Verify that the user is an admin
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'You do not have administrator permissions' });
      }
      
      const users = await storage.getAllUsers();
      res.json(users.map(toPublicUser));
    } catch (error: any) {
      console.error('Error retrieving the users:', error);
      res.status(500).json({ message: 'Error retrieving the user list' });
    }
  });
  
  app.put("/api/admin/users/:id/role", async (req, res) => {
    try {
      // Verify that the user is an admin
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'You do not have administrator permissions' });
      }
      
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      
      // Check that the supplied role is valid
      if (!['user', 'vip', 'unlimited', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      
      const updatedUser = await storage.updateUserRole(userId, role);
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(toPublicUser(updatedUser));
    } catch (error: any) {
      console.error("Error updating the user's role:", error);
      res.status(500).json({ message: "Error updating the user's role" });
    }
  });
  
  // API endpoint for deleting a user
  app.delete("/api/admin/users/:id", async (req, res) => {
    try {
      // Verify that the user is an admin
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'You do not have administrator permissions' });
      }
      
      const userId = parseInt(req.params.id);
      
      // Deleting yourself is not allowed
      if (userId === req.user!.id) {
        return res.status(403).json({ message: 'You cannot delete your own account' });
      }
      
      // Deleting the main admin is not allowed
      if (userId === 4) { // ID of the main admin
        return res.status(403).json({ message: 'The main administrator account cannot be deleted' });
      }
      
      // Delete the user
      const success = await storage.deleteUser(userId);
      
      if (!success) {
        return res.status(404).json({ message: 'The user was not found, or could not be deleted' });
      }
      
      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting the user:', error);
      res.status(500).json({ message: 'Error deleting the user' });
    }
  });
  
  // API endpoint for activating a user (admin)
  app.put("/api/admin/users/:id/activate", async (req, res) => {
    try {
      // Verify that the user is an admin
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'You do not have administrator permissions' });
      }
      
      const userId = parseInt(req.params.id);
      
      // Activate the user
      const activatedUser = await storage.activateUserById(userId);
      
      if (!activatedUser) {
        return res.status(404).json({ message: 'The user was not found, or could not be activated' });
      }
      
      res.json({ success: true, message: 'The user has been activated', user: activatedUser });
    } catch (error: any) {
      console.error('Error activating the user:', error);
      res.status(500).json({ message: 'Error activating the user' });
    }
  });

  // API endpoint for changing a user's password (admin)
  app.put("/api/admin/users/:id/password", async (req, res) => {
    try {
      // Verify that the user is an admin
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      if (req.user!.role !== 'admin') {
        return res.status(403).json({ message: 'You do not have administrator permissions' });
      }
      
      const userId = parseInt(req.params.id);
      const { newPassword } = req.body;
      
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: 'The new password must be at least 8 characters long' });
      }
      
      // Change a user's password
      const success = await storage.changeUserPassword(userId, newPassword);
      
      if (!success) {
        return res.status(404).json({ message: 'The user was not found, or the password could not be changed' });
      }
      
      res.json({ success: true, message: "The user's password has been changed" });
    } catch (error: any) {
      console.error("Error changing the user's password:", error);
      res.status(500).json({ message: "Error changing the user's password" });
    }
  });
  
  // API for user settings
  app.put("/api/user/settings", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }

      const { darkMode } = req.body;
      
      if (darkMode !== undefined) {
        // Update only the darkMode setting
        await db.update(users)
          .set({ darkMode })
          .where(eq(users.id, req.user!.id))
          .returning();
      }
      
      // Return the updated data
      const [updatedUser] = await db.select()
        .from(users)
        .where(eq(users.id, req.user!.id));
        
      res.json(toPublicUser(updatedUser));
    } catch (error: any) {
      console.error("Error updating the user's settings:", error);
      res.status(500).json({ message: 'Error updating the settings' });
    }
  });
  
  app.post("/api/user/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Missing passwords' });
      }
      
      // Load the user
      const user = await storage.getUser(req.user!.id);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Verify the current password
      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'The current password is incorrect' });
      }
      
      // Change the password. The plain text is passed on purpose – changeUserPassword
      // hashes it. Hashing here as well would store hash(hash(password)).
      const success = await storage.changeUserPassword(user.id, newPassword);
      
      if (!success) {
        return res.status(500).json({ message: 'Error changing the password' });
      }
      
      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      console.error('Error changing the password:', error);
      res.status(500).json({ message: 'Error changing the password' });
    }
  });
  
  app.delete("/api/user/account", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: 'You are not logged in' });
      }
      
      // Refuse account deletion if the user is an admin
      if (req.user!.role === 'admin') {
        return res.status(403).json({ message: 'An administrator account cannot be deleted this way' });
      }
      
      const success = await storage.deleteUser(req.user!.id);
      
      if (!success) {
        return res.status(500).json({ message: 'Error deleting the account' });
      }
      
      // Log the user out after deleting the account
      req.logout((err) => {
        if (err) {
          console.error('Error logging out after the account was deleted:', err);
        }
        res.json({ message: 'The account has been deleted' });
      });
    } catch (error: any) {
      console.error('Error deleting the account:', error);
      res.status(500).json({ message: 'Error deleting the account' });
    }
  });
  
  // API endpoints for global team management
  app.get("/api/user/team", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        message: "User is not logged in",
      });
    }
    
    try {
      const teamMembers = await storage.getGlobalTeamMembers(req.user!.id);
      return res.json(teamMembers);
    } catch (error: any) {
      console.error("Error fetching global team members:", error);
      return res.status(500).json({
        message: "Error loading the global team members",
      });
    }
  });
  
  app.post("/api/user/team", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        message: "User is not logged in",
      });
    }
    
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          message: "Missing user email",
        });
      }
      
      // Add a user to the global team
      const teamMember = await storage.addGlobalTeamMember(req.user!.id, email);
      return res.status(201).json(teamMember);
    } catch (error: any) {
      console.error("Error adding global team member:", error);
      return res.status(error.message.includes("nebyl nalezen") ? 404 : 400).json({
        message: error.message || "Error adding a member to the global team",
      });
    }
  });
  
  app.delete("/api/user/team/:memberId", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        message: "User is not logged in",
      });
    }
    
    try {
      const memberId = parseInt(req.params.memberId);
      
      if (isNaN(memberId)) {
        return res.status(400).json({
          message: "Invalid team member ID",
        });
      }
      
      // Remove a user from the global team
      const success = await storage.removeGlobalTeamMember(req.user!.id, memberId);
      
      if (!success) {
        return res.status(404).json({
          message: "Team member not found",
        });
      }
      
      return res.json({
        message: "The member has been removed from the global team",
      });
    } catch (error: any) {
      console.error("Error removing global team member:", error);
      return res.status(500).json({
        message: "Error removing a member from the global team",
      });
    }
  });

  // Get user's projects
  app.get("/api/user/projects", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        message: "User is not logged in",
      });
    }
    
    console.log("Fetching projects for user:", req.user!.id, req.user!.username);
    try {
      // Get projects from storage
      const projects = await storage.getProjectsByUser(req.user!.id);
      console.log("Found projects:", projects.length);
      
      // Return projects
      return res.json(projects);
    } catch (error: any) {
      console.error("Error fetching user projects:", error);
      return res.status(500).json({
        message: "An error occurred while loading the projects",
      });
    }
  });
  
  // Create new project
  app.post("/api/projects", checkProjectLimits, async (req, res) => {
    // Project quota checks are already performed by the checkProjectLimits middleware
    
    try {
      // Create a new project
      const { name, colorTheme } = req.body;
      
      const project = await storage.createProject({
        name,
        colorTheme,
        defaultPrompt: SIMPLE_ASSISTANT_PROMPT, // Default value for a new project
        embedToken: nanoid(), // Generate a unique embed token when the project is created
        welcomeMessage: "Hi, feel free to ask a question here", // Default welcome message
      }, req.user!.id);
      
      return res.status(201).json(project);
    } catch (error: any) {
      console.error("Error creating project:", error);
      return res.status(500).json({
        message: "An error occurred while creating the project",
      });
    }
  });
  
  // Get project by ID
  app.get("/api/projects/:id", checkProjectAccess, async (req, res) => {
    // The project is already loaded by the middleware and added to req.project
    return res.json(req.project);
  });
  
  // Update project
  app.patch("/api/projects/:id", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may edit the project settings",
        });
      }
      
      // Update only the allowed fields
      const allowedFields = ["name", "colorTheme", "defaultPrompt", "anthropicApiKey", "openaiApiKey", "chatbotName", "welcomeMessage", "notificationEnabled", "notificationDelay", "notificationText", "aiProvider", "aiModel", "googleApiKey", "azureEndpoint", "azureDeployment", "embedStyle", "embedDisclaimer", "botIconUrl", "hidePoweredBy",
        "allowedDomains", "monthlyMessageLimit",
        // The rating settings were in the chatbot settings form and not in this
        // list, so saving them did nothing - the form posted them and the server
        // dropped them without a word.
        "ratingEnabled", "ratingPromptMessage", "ratingThankYouMessage"];
      const updateData: any = {};
      
      for (const field of allowedFields) {
        if (field in req.body) {
          updateData[field] = req.body[field];
        }
      }
      
      // If there is nothing to update, return an error
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          message: "No data to update",
        });
      }

      if (updateData.monthlyMessageLimit !== undefined) {
        const limit = Number(updateData.monthlyMessageLimit);
        if (!Number.isInteger(limit) || limit < 0) {
          return res.status(400).json({
            message: "The monthly message limit must be a whole number, or 0 for no limit",
          });
        }
        updateData.monthlyMessageLimit = limit;
      }

      // The server sends requests to azureEndpoint itself – it must not point anywhere.
      if (updateData.azureEndpoint && !isAllowedAzureEndpoint(updateData.azureEndpoint)) {
        return res.status(400).json({
          message: "Invalid Azure endpoint. An HTTPS address of the form https://<name>.openai.azure.com is expected",
        });
      }

      // Aktualizace projektu
      const updatedProject = await storage.updateProject(projectId, updateData);
      
      if (!updatedProject) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      return res.json(updatedProject);
    } catch (error: any) {
      console.error("Error updating project:", error);
      return res.status(500).json({
        message: "An error occurred while updating the project",
      });
    }
  });
  
  // Delete project
  app.delete("/api/projects/:id", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may delete the project",
        });
      }
      
      // Delete the project
      await storage.deleteProject(projectId);
      
      return res.status(204).end();
    } catch (error: any) {
      console.error("Error deleting project:", error);
      return res.status(500).json({
        message: "An error occurred while deleting the project",
      });
    }
  });
  
  // Upload bot icon
  app.post("/api/projects/:id/bot-icon", checkProjectAccess, iconUpload.single('icon'), async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may change the bot icon",
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          message: "No file was uploaded",
        });
      }
      
      // Build the icon URL (relative path)
      const iconUrl = `/icons/${req.file.filename}`;
      
      // Aktualizujeme projekt s URL ikonky
      const updatedProject = await storage.updateProject(projectId, {
        botIconUrl: iconUrl
      });
      
      return res.json({
        message: "Bot icon uploaded successfully",
        iconUrl: iconUrl,
        project: updatedProject
      });
    } catch (error: any) {
      console.error("Error uploading bot icon:", error);
      return res.status(500).json({
        message: "An error occurred while uploading the bot icon",
      });
    }
  });
  
  // HEAD endpoint pre bot icon (na overenie existencie)
  app.head("/api/projects/:id/bot-icon", async (req, res) => {
    try {
      const projectIdOrToken = req.params.id;
      let project = null;
      
      console.log("Bot Icon HEAD: Looking for project with ID/token:", projectIdOrToken);
      
      // First try to find the project by ID
      if (!isNaN(Number(projectIdOrToken))) {
        project = await storage.getProject(Number(projectIdOrToken));
        console.log("Bot Icon HEAD: Looking for project by ID:", projectIdOrToken);
      }
      
      // If not found by ID, try the embed token
      if (!project) {
        const projects = await storage.getProjects();
        project = projects.find(p => p.embedToken === projectIdOrToken);
        console.log("Bot Icon HEAD: Looking for project by token:", projectIdOrToken);
        if (project) {
          console.log("Bot Icon HEAD: Found project by token:", project.name);
        }
      }
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      console.log("Bot Icon HEAD: Project botIconUrl:", project.botIconUrl);
      
      if (!project.botIconUrl) {
        return res.status(404).json({ message: "The project has no bot icon set" });
      }
      
      // Check whether the file exists
      const iconPath = path.join(process.cwd(), project.botIconUrl);
      if (!fs.existsSync(iconPath)) {
        console.log("Bot Icon HEAD: Icon file not found:", iconPath);
        return res.status(404).json({ message: "Icon file not found" });
      }
      
      // Set the correct headers for the HEAD response only
      const extension = path.extname(iconPath).toLowerCase();
      let mimeType = 'application/octet-stream';
      
      switch (extension) {
        case '.png':
          mimeType = 'image/png';
          break;
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.gif':
          mimeType = 'image/gif';
          break;
        case '.svg':
          mimeType = 'image/svg+xml';
          break;
      }
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('ETag', `"${fs.statSync(iconPath).mtime.getTime()}"`);
      
      return res.status(200).end();
    } catch (error: any) {
      console.error("Error in bot icon HEAD endpoint:", error);
      return res.status(500).json({ message: "Chyba pri kontrole ikony bota" });
    }
  });

  // Get bot icon
  app.get("/api/projects/:id/bot-icon", async (req, res) => {
    try {
      const projectIdOrToken = req.params.id;
      let project = null;
      
      console.log(`Bot Icon GET: Looking for project with ID/token: ${projectIdOrToken}`);
      
      // STEP 1: try to find the project by ID (if it is a number)
      const numericId = parseInt(projectIdOrToken);
      if (!isNaN(numericId)) {
        project = await storage.getProject(numericId);
        console.log(`Bot Icon GET: Found project by ID:`, project ? project.name : 'not found');
      }
      
      // STEP 2: if the project was not found by ID, try the embed token
      if (!project) {
        console.log(`Bot Icon GET: Looking for project by token: ${projectIdOrToken}`);
        const allProjects = await storage.getProjects();
        project = allProjects.find(p => p.embedToken === projectIdOrToken);
        console.log(`Bot Icon GET: Found project by token:`, project ? project.name : 'not found');
      }
      
      if (!project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen"
        });
      }
      
      // Check whether the project has a bot icon
      console.log(`Bot Icon GET: Project botIconUrl:`, project.botIconUrl);
      if (!project.botIconUrl) {
        return res.status(404).json({
          message: "The project has no bot icon set"
        });
      }
      
      // Build the path to the icon
      const iconPath = path.join(".", project.botIconUrl);
      
      // Kontrola, zda soubor existuje
      if (!fs.existsSync(iconPath)) {
        return res.status(404).json({
          message: "Soubor ikony nebyl nalezen"
        });
      }
      
      // Determine the MIME type from the extension
      const ext = path.extname(iconPath).toLowerCase();
      let mimeType = 'image/png'; // default
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.png':
          mimeType = 'image/png';
          break;
        case '.gif':
          mimeType = 'image/gif';
          break;
        case '.svg':
          mimeType = 'image/svg+xml';
          break;
      }
      
      // Set the correct headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=300'); // cache for 5 minutes only
      res.setHeader('ETag', `"${fs.statSync(iconPath).mtime.getTime()}"`); // ETag based on the modification time
      
      // Send the file
      res.sendFile(path.resolve(iconPath));
      
    } catch (error: any) {
      console.error("Error serving bot icon:", error);
      return res.status(500).json({
        message: "An error occurred while loading the bot icon"
      });
    }
  });

  // Delete bot icon
  app.delete("/api/projects/:id/bot-icon", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may delete the bot icon",
        });
      }
      
      // Get the current project in order to resolve the icon path
      const project = req.project!;
      
      // If the project has an icon, delete the file
      if (project.botIconUrl) {
        const iconPath = path.join(".", project.botIconUrl);
        if (fs.existsSync(iconPath)) {
          fs.unlinkSync(iconPath);
        }
      }
      
      // Aktualizujeme projekt - odebereme URL ikonky
      const updatedProject = await storage.updateProject(projectId, {
        botIconUrl: null
      });
      
      return res.json({
        message: "Bot icon deleted successfully",
        project: updatedProject
      });
    } catch (error: any) {
      console.error("Error deleting bot icon:", error);
      return res.status(500).json({
        message: "An error occurred while deleting the bot icon",
      });
    }
  });
  
  // Get project stats
  app.get("/api/projects/:id/stats", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Load the project statistics
      const stats = await storage.getProjectStats(projectId);
      
      return res.json(stats);
    } catch (error: any) {
      console.error("Error fetching project stats:", error);
      return res.status(500).json({
        message: "An error occurred while loading the project statistics",
      });
    }
  });

  // API endpoint for loading unsuccessful answers (for administrators)
  /** How many visitor messages this project has taken this calendar month. */
  app.get("/api/projects/:id/message-usage", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { messagesThisMonth } = await import("./services/embedGuards");

      res.json({
        used: await messagesThisMonth(projectId),
        limit: req.project?.monthlyMessageLimit ?? 0,
      });
    } catch (error: any) {
      console.error("Error counting this month's messages:", error);
      res.status(500).json({ message: "The message count could not be read" });
    }
  });

  app.get("/api/projects/:id/failed-responses", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      
      // Load unsuccessful answers together with session information
      const failedResponsesData = await db.select({
        id: failedResponses.id,
        userQuery: failedResponses.userQuery,
        aiResponse: failedResponses.aiResponse,
        failureReason: failedResponses.failureReason,
        chunksFound: failedResponses.chunksFound,
        documentsSearched: failedResponses.documentsSearched,
        isResolved: failedResponses.isResolved,
        adminNotes: failedResponses.adminNotes,
        resolvedAt: failedResponses.resolvedAt,
        createdAt: failedResponses.createdAt,
        sessionId: failedResponses.id
      })
      .from(failedResponses)
      .where(eq(failedResponses.projectId, projectId))
      .orderBy(desc(failedResponses.createdAt))
      .limit(limit)
      .offset(offset);
      
      // Total number of unsuccessful answers
      const totalResult = await db.select({ count: sql`count(*)` })
        .from(failedResponses)
        .where(eq(failedResponses.projectId, projectId));
      
      const total = Number(totalResult[0]?.count || 0);
      
      // Number of unresolved items
      const unresolvedResult = await db.select({ count: sql`count(*)` })
        .from(failedResponses)
        .where(and(
          eq(failedResponses.projectId, projectId),
          eq(failedResponses.isResolved, false)
        ));
      
      const unresolved = Number(unresolvedResult[0]?.count || 0);
      
      return res.json({
        failedResponses: failedResponsesData,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        summary: {
          total,
          unresolved,
          resolved: total - unresolved
        }
      });
    } catch (error: any) {
      console.error("Error fetching failed responses:", error);
      return res.status(500).json({
        message: "An error occurred while loading the unsuccessful answers",
      });
    }
  });

  // API endpoint for marking an unsuccessful answer as resolved
  app.patch("/api/projects/:id/failed-responses/:responseId/resolve", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const responseId = parseInt(req.params.responseId);
      const { adminNotes } = req.body;
      const userId = req.user?.id;
      
      // Update the record
      const [updatedResponse] = await db.update(failedResponses)
        .set({
          isResolved: true,
          resolvedAt: new Date(),
          resolvedBy: userId,
          adminNotes: adminNotes || null
        })
        .where(and(
          eq(failedResponses.id, responseId),
          eq(failedResponses.projectId, projectId)
        ))
        .returning();
      
      if (!updatedResponse) {
        return res.status(404).json({ message: "Unsuccessful answer not found" });
      }
      
      return res.json({ message: "The unsuccessful answer has been marked as resolved", response: updatedResponse });
    } catch (error: any) {
      console.error("Error resolving failed response:", error);
      return res.status(500).json({
        message: "An error occurred while marking the answer as resolved",
      });
    }
  });

  // API endpoint for deleting an unsuccessful answer
  app.delete("/api/projects/:id/failed-responses/:responseId", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const responseId = parseInt(req.params.responseId);
      
      // Delete the record
      const deletedResponse = await db.delete(failedResponses)
        .where(and(
          eq(failedResponses.id, responseId),
          eq(failedResponses.projectId, projectId)
        ))
        .returning();
      
      if (deletedResponse.length === 0) {
        return res.status(404).json({ message: "Unsuccessful answer not found" });
      }
      
      return res.json({ message: "The unsuccessful answer has been deleted" });
    } catch (error: any) {
      console.error("Error deleting failed response:", error);
      return res.status(500).json({
        message: "An error occurred while deleting the unsuccessful answer",
      });
    }
  });
  
  // Endpointy pro chatbot analytics
  
  // Endpoint for storing a chatbot interaction (open, query, close)
  app.post("/api/projects/:id/chatbot-analytics", async (req, res) => {
    const startTime = Date.now();
    const analyticsId = req.headers['x-analytics-id'] || `anon-${Math.random().toString(36).substring(2, 10)}`;
    
    console.log(`Analytics [${analyticsId}]: starting to process the request`);
    
    try {
      let projectId = null;
      let project = null;
      const projectIdOrToken = req.params.id;
      
      // Set headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      console.log(`Analytics [${analyticsId}]: processing the request for project/token: ${projectIdOrToken}`);
      
      // STEP 1: try to find the project by ID (if it is a number)
      const numericId = parseInt(projectIdOrToken);
      if (!isNaN(numericId)) {
        console.log(`Analytics [${analyticsId}]: ${projectIdOrToken} is a numeric ID, looking up by ID ${numericId}`);
        project = await storage.getProject(numericId);
        if (project) {
          projectId = project.id;
          console.log(`Analytics [${analyticsId}]: project found by ID ${numericId}, name: ${project.name}`);
        } else {
          console.log(`Analytics [${analyticsId}]: no project found with ID ${numericId}`);
        }
      }
      
      // STEP 2: if the project was not found by ID, try the embed token
      if (!project) {
        console.log(`Analytics [${analyticsId}]: looking up the project by embed token: "${projectIdOrToken}"`);
        
        // Get all projects for comparison
        const allProjects = await storage.getProjects();
        console.log(`Analytics [${analyticsId}]: loaded ${allProjects.length} projects for token comparison`);
        
        // Method 1: direct token comparison
        project = allProjects.find(p => p.embedToken === projectIdOrToken);
        
        // Method 2: if direct comparison fails, try a stricter comparison with trimming
        if (!project) {
          console.log(`Analytics [${analyticsId}]: direct comparison failed, trying a stricter comparison...`);
          
          // Try an exact string comparison to find the project
          for (const p of allProjects) {
            if (p.embedToken) {
              const projectToken = String(p.embedToken).trim();
              const requestToken = String(projectIdOrToken).trim();
              
              if (projectToken === requestToken) {
                project = p;
                projectId = p.id;
                console.log(`Analytics [${analyticsId}]: MATCH FOUND! Project ${p.id} (${p.name}) matches token "${requestToken}"`);
                break;
              }
            }
          }
        } else {
          projectId = project.id;
          console.log(`Analytics [${analyticsId}]: project found by direct comparison: ID ${projectId}, name: ${project.name}`);
        }
      }
      
      // KROK 3: Kontrola, zda byl projekt nalezen
      if (!project) {
        console.error(`Analytika [${analyticsId}]: Projekt nebyl nalezen ani podle ID, ani podle embedTokenu: ${projectIdOrToken}`);
        return res.status(404).json({ 
          success: false,
          message: "Projekt nebyl nalezen",
          timestamp: Date.now(),
          requestId: analyticsId
        });
      }
      
      // STEP 4: validate the input data
      const { 
        pageUrl,
        referrer,
        action,
        visitorId,
        sessionId,
        userAgent,
        deviceType,
        duration 
      } = req.body;
      
      // Verify that we have the required data
      if (!action || !visitorId) {
        return res.status(400).json({ 
          success: false,
          message: "Missing required data (action, visitorId)",
          timestamp: Date.now(),
          requestId: analyticsId,
          validation: {
            action: !action ? "missing" : "ok",
            visitorId: !visitorId ? "missing" : "ok"
          }
        });
      }
      
      // Validate the action
      const validActions = ['open', 'query', 'close'];
      if (!validActions.includes(action)) {
        return res.status(400).json({ 
          success: false,
          message: `Invalid value for action: ${action}. Allowed values: ${validActions.join(', ')}`,
          timestamp: Date.now(),
          requestId: analyticsId
        });
      }
      
      // Get the client's IP address
      const ipAddress = req.headers['x-forwarded-for'] || 
                      req.socket.remoteAddress || 
                      '';
      
      // STEP 5: store the analytics data
      console.log(`Analytics [${analyticsId}]: storing data, action: ${action}, visitor: ${visitorId}, page: ${pageUrl || 'N/A'}`);
      
      const analyticsData = {
        projectId,
        pageUrl,
        referrer,
        action,
        visitorId,
        sessionId,
        userAgent,
        ipAddress,
        duration: duration ? parseInt(duration) : undefined,
        deviceType
      };
      
      const result = await storage.createChatbotAnalytics(analyticsData);
      
      // Measure the processing time for optimisation
      const processingTime = Date.now() - startTime;
      
      // Return a success response with useful information for the client
      res.status(201).json({ 
        success: true,
        message: "The analytics data has been saved",
        timestamp: Date.now(),
        requestId: analyticsId,
        processingTime: `${processingTime}ms`,
        id: result.id,
        projectId: projectId
      });
      
      console.log(`Analytics [${analyticsId}]: completed in ${processingTime}ms, project: ${projectId}`);
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(`Analytika [${analyticsId}]: Chyba po ${processingTime}ms:`, error);
      
      res.status(500).json({ 
        success: false, 
        message: error.message || "An error occurred while saving the analytics data",
        timestamp: Date.now(),
        requestId: analyticsId,
        processingTime: `${processingTime}ms`
      });
    }
  });

  // Endpoint pre hodnotenie chat session
  app.post("/api/embed/rate-session", async (req, res) => {
    try {
      const { sessionId, rating, token } = req.body;
      
      if (!sessionId || !rating || !token) {
        return res.status(400).json({
          success: false,
          message: "Missing sessionId, rating, or token"
        });
      }
      
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "The rating must be between 1 and 5"
        });
      }

      // Verify that the session exists and belongs to the project with the given token
      const session = await storage.getChatSession(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          message: "Chat session not found"
        });
      }

      // Verify the project by token
      const project = await storage.getProjectByToken(token);
      if (!project || project.id !== session.projectId) {
        return res.status(403).json({
          success: false,
          message: "Invalid token"
        });
      }

      // Store the rating
      const updatedSession = await storage.rateChatSession(sessionId, rating);
      
      res.json({
        success: true,
        message: "The rating has been saved",
        session: updatedSession
      });

    } catch (error: any) {
      console.error('Error saving the rating:', error);
      res.status(500).json({
        success: false,
        message: "Error saving the rating"
      });
    }
  });
  
  // Endpoint for retrieving chatbot statistics
  app.get("/api/projects/:id/chatbot-analytics/stats", checkProjectAccess, async (req, res) => {
    const startTime = Date.now();
    const requestId = `stats-${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      const projectId = parseInt(req.params.id);
      
      // Set strong headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('X-Analytics-Timestamp', Date.now().toString());
      
      // Note: this endpoint is protected by the checkProjectAccess middleware,
      // which requires login. Embed tokens are only for public API calls.
      console.log(`Analytics [${requestId}]: loading statistics for project ${projectId}`);
      
      // Use Promise.all to run the database queries in parallel
      const stats = await storage.getChatbotAnalyticsStats(projectId);
      
      // Measure the processing time for monitoring
      const processingTime = Date.now() - startTime;
      console.log(`Analytics [${requestId}]: statistics loaded in ${processingTime}ms`);
      
      // Add a timestamp and other metadata for frontend update detection and monitoring
      res.json({
        success: true,
        stats,
        metadata: {
          timestamp: Date.now(),
          requestId: requestId,
          processingTime: processingTime,
          generated: new Date().toISOString()
        }
      });
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(`Analytics [${requestId}]: error loading statistics after ${processingTime}ms:`, error);
      
      res.status(500).json({ 
        success: false, 
        message: error.message || "An error occurred while retrieving the chatbot statistics",
        metadata: {
          timestamp: Date.now(),
          requestId: requestId,
          processingTime: processingTime,
          error: error.message
        }
      });
    }
  });
  
  // Endpoint for retrieving detailed analytics data
  app.get("/api/projects/:id/chatbot-analytics", checkProjectAccess, async (req, res) => {
    const startTime = Date.now();
    const requestId = `detail-${Math.random().toString(36).substring(2, 10)}`;
    
    try {
      const projectId = parseInt(req.params.id);
      
      // Set strong headers to prevent caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Request-ID', requestId);
      res.setHeader('X-Analytics-Timestamp', Date.now().toString());
      
      console.log(`Analytics [${requestId}]: loading detailed data for project ${projectId}`);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid project ID",
          requestId
        });
      }
      
      // Process the filtering parameters
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      let limit: number | undefined;
      
      if (req.query.start) {
        startDate = new Date(req.query.start as string);
        console.log(`Analytika [${requestId}]: Filtruji od ${startDate.toISOString()}`);
      }
      
      if (req.query.end) {
        endDate = new Date(req.query.end as string);
        console.log(`Analytika [${requestId}]: Filtruji do ${endDate.toISOString()}`);
      }
      
      if (req.query.limit) {
        limit = parseInt(req.query.limit as string);
        if (isNaN(limit) || limit <= 0) {
          limit = undefined;
        } else {
          console.log(`Analytics [${requestId}]: limiting the number of results to ${limit}`);
        }
      }
      
      // Get the analytics data
      const analytics = await storage.getChatbotAnalyticsForProject(projectId, startDate, endDate, limit);
      
      const processingTime = Date.now() - startTime;
      console.log(`Analytics [${requestId}]: loaded ${analytics.length} records in ${processingTime}ms`);
      
      res.json({
        success: true,
        analytics,
        metadata: {
          timestamp: Date.now(),
          requestId,
          count: analytics.length,
          processingTime,
          filters: {
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            limit
          }
        }
      });
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(`Analytics [${requestId}]: error loading detailed data after ${processingTime}ms:`, error);
      
      res.status(500).json({ 
        success: false, 
        message: error.message || "An error occurred while retrieving the chatbot analytics data",
        metadata: {
          timestamp: Date.now(),
          requestId,
          processingTime,
          error: error.message
        }
      });
    }
  });
  
  // The activity-over-time endpoint has been removed
  
  // DIAGNOSTIC endpoint for token debugging - DEVELOPMENT ENVIRONMENT ONLY
  // REMOVED: /api/diagnostic/tokens
  // This unauthenticated endpoint listed the embed tokens of every project. Anyone could
  // download them and use someone else's chatbot through their token (and read the
  // contents of their documents through the answers). A project's embed token is in its detail page.


  // Upload PDF document
  app.post("/api/projects/:id/pdfs", checkProjectAccess, checkPdfLimits, upload.single("pdf"), async (req, res) => {
    // Check whether a file was uploaded
    if (!req.file) {
      return res.status(400).json({
        message: "No file was uploaded",
      });
    }
    
    try {
      const projectId = parseInt(req.params.id);
      
      // Check whether the uploaded file is a PDF
      if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
        // Delete the uploaded file if it is not a PDF
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: "Only PDF files can be uploaded",
        });
      }
      
      // The file is already stored in the project folder (thanks to the multer configuration)
      console.log(`PDF file uploaded to: ${req.file.path}`);
      
      // Create the document label with metadata
      let pdfMetadata = {
        filename: req.file.originalname,
        path: req.file.path,
        size: req.file.size,
        uploadedAt: new Date().toISOString()
      };
      
      // Create a simple document description to store in the database
      const pdfContent = `DOCUMENT: ${req.file.originalname}\nPATH: ${req.file.path}\n\nThis document is stored on disk and will be read directly by the AI model when queried.`;
      
      // Debug output
      console.log("---------- PDF UPLOAD DIAGNOSTICS ----------");
      console.log(`PDF Filename: ${req.file.originalname}`);
      console.log(`PDF Path: ${req.file.path}`);
      console.log(`PDF Size: ${req.file.size} bytes`);
      console.log("------------------------------------------");
      
      // Extract the actual content of the PDF file
      let pdfRecord;
      let extractedContentVar = '';

      // Source weight for search (from form data, default 5)
      const weight = parseInt(req.body.weight) || 5;
      // Keep the original name including diacritics; a safe variant is used on disk
      const originalFilename = req.file.originalname;
      const storagePath = req.file.filename;

      try {
        console.log("Starting text extraction from the PDF file...");
        const { extractTextFromFile } = await import('./services/pdfExtractor');
        const extracted = await extractTextFromFile(req.file.path);
        extractedContentVar = extracted.text;

        console.log(`Extracted ${extracted.text.length} characters of text from ${extracted.pages} pages`);

        if (!extracted.text.trim()) {
          console.warn(`The PDF "${originalFilename}" contains no text content (probably a scan without OCR)`);
        }

        // Combine the description and the extracted content
        const fullContent = `${pdfContent}\n\n=== EXTRACTED CONTENT ===\n\n${extracted.text}`;

        // Create the database record
        pdfRecord = await storage.createPdf({
          projectId,
          filename: originalFilename,
          storagePath,
          uploadedById: req.user!.id,
          content: fullContent, // Store both the description and the actual document content
          totalPages: extracted.pages,
          fileSize: req.file.size,
          weight,
        });
      } catch (extractError: any) {
        console.error("Error extracting text from the PDF:", extractError);

        // If text extraction fails, store at least the basic information
        pdfRecord = await storage.createPdf({
          projectId,
          filename: originalFilename,
          storagePath,
          uploadedById: req.user!.id,
          content: pdfContent + "\n\nError extracting the content: " + (extractError as Error).message,
          fileSize: req.file.size,
          processingStatus: "failed",
          processingError: (extractError as Error).message,
          weight,
        });
      }

      // IMPORTANT: the file is not deleted; it stays on disk for later reprocessing

      if (extractedContentVar && req.project?.openaiApiKey) {
        console.log(`🔄 Starting ChatGPT chunking for PDF ${pdfRecord.id}...`);
        
        // Asynchronous processing - does not block the response to the user
        (async () => {
          try {
            const { DocumentProcessor } = await import('./services/documentProcessor');
            await DocumentProcessor.processUploadedPDF(
              pdfRecord.id, 
              extractedContentVar, 
              projectId
            );
            console.log(`✅ ChatGPT chunking finished for PDF ${pdfRecord.id}`);
          } catch (chunkError: any) {
            console.error(`❌ Error during ChatGPT chunking of PDF ${pdfRecord.id}:`, chunkError);
          }
        })();
      } else {
        console.log(`⚠️ Skipping chunking - missing content or OpenAI key`);
      }
      
      return res.status(201).json({
        id: pdfRecord.id,
        projectId: pdfRecord.projectId,
        filename: pdfRecord.filename,
        uploadedById: pdfRecord.uploadedById,
        createdAt: pdfRecord.createdAt,
        path: req.file.path, // Include the file path in the response
        chunkingStarted: !!(extractedContentVar && req.project?.openaiApiKey)
      });
    } catch (error: any) {
      console.error("Error uploading PDF:", error);
      
      // If an error occurred, try to delete the uploaded file
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e: any) {
          console.error("Error deleting temporary file:", e);
        }
      }
      
      return res.status(500).json({
        message: "An error occurred while uploading the PDF: " + (error.message || "Unknown error"),
      });
    }
  });

  // Trigger ChatGPT chunking for specific PDF
  app.post('/api/projects/:projectId/pdfs/:pdfId/process-chatgpt-chunks', requireAuth, checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const pdfId = parseInt(req.params.pdfId);
      
      console.log(`🤖 Starting ChatGPT chunking for PDF ${pdfId} in project ${projectId}...`);
      
      if (!req.project?.openaiApiKey) {
        return res.status(400).json({ 
          success: false,
          message: 'The project has no OpenAI API key' 
        });
      }

      // Load the PDF content
      const pdf = await storage.getPdf(pdfId);
      if (!pdf || pdf.projectId !== projectId) {
        return res.status(404).json({ 
          success: false,
          message: 'PDF nenalezen' 
        });
      }

      if (!pdf.content) {
        return res.status(400).json({ 
          success: false,
          message: 'The PDF has no extracted content' 
        });
      }

      // Start ChatGPT chunking
      const { DocumentProcessor } = await import('./services/documentProcessor');
      const result = await DocumentProcessor.processUploadedPDF(
        pdfId, 
        pdf.content, 
        projectId
      );
      
      console.log(`✅ ChatGPT chunking finished for PDF ${pdfId}`);
      
      res.json({
        success: true,
        message: 'The PDF was processed successfully by the ChatGPT chunking system',
        result
      });
    } catch (error: any) {
      console.error('Error in ChatGPT chunking:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error during ChatGPT chunking',
        error: error.message
      });
    }
  });
  
  // Get project PDFs
  app.get("/api/projects/:id/pdfs", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Load the PDF documents
      const pdfs = await storage.getPdfs(projectId);
      
      // Do not send document contents in the response, only metadata
      const pdfData = pdfs.map(pdf => ({
        id: pdf.id,
        projectId: pdf.projectId,
        filename: pdf.filename,
        uploadedById: pdf.uploadedById,
        createdAt: pdf.createdAt,
      }));
      
      return res.json(pdfData);
    } catch (error: any) {
      console.error("Error fetching PDFs:", error);
      return res.status(500).json({
        message: "An error occurred while loading the PDF documents",
      });
    }
  });
  
  // Delete PDF
  app.delete("/api/projects/:id/pdfs/:pdfId", checkProjectAccess, async (req, res) => {
    try {
      const pdfId = parseInt(req.params.pdfId);
      
      // Check that the PDF exists and belongs to the project
      const pdf = await storage.getPdf(pdfId);
      
      if (!pdf || pdf.projectId !== req.project!.id) {
        return res.status(404).json({
          message: "PDF dokument nebyl nalezen",
        });
      }
      
      // Permission check - only the project owner or a team member with the owner/editor role
      if (req.project!.ownerId !== req.user!.id) {
        const teamMembers = await storage.getTeamMembers(req.project!.id);
        const userRole = teamMembers.find(tm => tm.userId === req.user!.id)?.role;

        if (!userRole || userRole === 'viewer') {
          return res.status(403).json({
            message: "Only the project owner or an editor may delete PDF documents",
          });
        }
      }

      // Delete the PDF from the database (chunks are removed by cascade)
      await storage.deletePdf(pdfId);

      // Delete the file from disk so no orphaned files remain
      if (pdf.storagePath) {
        const filePath = path.join('pdfs', `${pdf.projectId}`, pdf.storagePath);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted file ${filePath}`);
          }
        } catch (unlinkError: any) {
          // The DB record is already gone; an orphaned file is no reason to fail the client
          console.error(`Could not delete file ${filePath}:`, unlinkError);
        }
      }

      return res.status(204).end();
    } catch (error: any) {
      console.error("Error deleting PDF:", error);
      return res.status(500).json({
        message: "An error occurred while deleting the PDF document",
      });
    }
  });
  
  // API endpoint for processing PDF documents via ChatGPT chunking
  app.post("/api/projects/:id/process-pdfs-for-embeddings", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      console.log("Starting ChatGPT chunking for project", projectId);
      
      // Load the project and verify the OpenAI key
      const project = await storage.getProject(projectId);
      if (!project?.openaiApiKey) {
        return res.status(400).json({
          success: false,
          message: "No OpenAI API key is set for this project",
        });
      }
      
      // Load the PDF documents
      const pdfs = await storage.getPdfs(projectId);
      console.log(`Found ${pdfs.length} PDF documents for processing`);
      
      if (pdfs.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No PDF documents available for processing",
        });
      }
      
      // Delete the existing chunks before processing
      await db.delete(documentChunks).where(eq(documentChunks.projectId, projectId));
      console.log(`🧹 Deleted the existing chunks for project ${projectId}`);
      
      let processedDocsCount = 0;
      
      // Import and process using DocumentProcessor
      try {
        const { DocumentProcessor } = await import('./services/documentProcessor');
        
        for (const pdf of pdfs) {
          if (!pdf.content || pdf.content.trim().length === 0) {
            console.log(`Skipping PDF ${pdf.id} - no content`);
            continue;
          }
          
          console.log(`🔄 Processing PDF ${pdf.id} (${pdf.filename}) with ChatGPT`);
          
          try {
            await DocumentProcessor.processUploadedPDF(pdf.id, pdf.content, projectId);
            processedDocsCount++;
            console.log(`✅ PDF ${pdf.id} processed successfully`);
          } catch (pdfError: any) {
            console.error(`❌ Error processing PDF ${pdf.id}:`, pdfError);
          }
        }
      } catch (importError: any) {
        console.error("❌ Error importing DocumentProcessor:", importError);
        return res.status(500).json({
          success: false,
          message: "Error initialising the ChatGPT processor",
        });
      }
      
      if (processedDocsCount === 0) {
        return res.status(400).json({
          success: false,
          message: "No PDF document was processed successfully",
        });
      }
      
      return res.json({
        success: true,
        message: `Successfully processed ${processedDocsCount} PDF documents with ChatGPT`,
        processedDocsCount,
      });
    } catch (error: any) {
      console.error("Error in ChatGPT processing:", error);
      return res.status(500).json({
        success: false,
        message: `Processing error: ${error.message}`,
      });
    }
  });

  app.post("/api/projects/:id/learn-pdfs", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      console.log("Starting enhanced AI training process for project", projectId);
      
      // Load all of the project's PDF documents including their content
      const pdfs = await storage.getPdfs(projectId);
      console.log(`Processing ${pdfs.length} PDF documents for training`);
      
      if (pdfs.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No PDF documents available for training",
        });
      }
      
      // Verify that the number of documents does not exceed the limit
      const MAX_DOCUMENTS = 30;
      if (pdfs.length > MAX_DOCUMENTS) {
        console.warn(`Warning: Project has ${pdfs.length} documents, which exceeds the recommended limit of ${MAX_DOCUMENTS}.`);
      }
      
      // For each document, verify that it has valid content
      let validDocuments = 0;
      let totalContentLength = 0;
      let processedDocuments = 0;
      
      for (const pdf of pdfs) {
        if (pdf.content && pdf.content.trim().length > 0) {
          validDocuments++;
          totalContentLength += pdf.content.length;
        }
      }
      
      // Verify the content processing limits
      if (validDocuments === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid content found in any uploaded PDF documents",
        });
      }
      
      console.log(`Document training stats: ${validDocuments} valid documents, ${totalContentLength} total characters`);
      
      try {
        // Before processing, delete all existing processed documents for this project
        for (const pdf of pdfs) {
          await storage.deleteProcessedDocumentsByPdfId(pdf.id);
        }

        // PDF processing happens in two steps:
        // 1. Split the document into chunks using the project's AI provider
        // 2. Create embeddings for similarity search
        // The specific provider (OpenAI / Google / Azure) comes from the project settings.

        console.log("Starting two-stage document processing");

        // Get the project settings
        const options = await storage.getTrainingOptions(projectId);
        
        // Process each document with the advanced AI processor
        // Document processing moved to services/documentProcessor
        
        // Process each document separately
        const processingResults = [];
        
        for (const pdf of pdfs) {
          if (pdf.content && pdf.content.trim().length > 0) {
            console.log(`Processing document: ${pdf.filename} (${pdf.id})`);
            
            try {
              // Process the document using Mistral AI
              const result = null
              
              if (result) {
                processedDocuments++;
                processingResults.push({
                  pdfId: pdf.id,
                  filename: pdf.filename,
                  success: true
                });
              } else {
                processingResults.push({
                  pdfId: pdf.id,
                  filename: pdf.filename,
                  success: false,
                  message: "Processing failed"
                });
              }
            } catch (docError: any) {
              console.error(`Error processing document ${pdf.id}:`, docError);
              processingResults.push({
                pdfId: pdf.id,
                filename: pdf.filename,
                success: false,
                message: docError.message || "Unknown error"
              });
            }
          }
        }
        
        // For vector search - DISABLED - we use the OpenAI API only
        try {
          console.log("Skipping local embeddings generation, using OpenAI API instead");
          
          // Note: embedding generation is currently disabled; we use the OpenAI API
          // In the future we may implement OpenAI embeddings
          
        } catch (embeddingError: any) {
          console.error("Error in embeddings flow:", embeddingError);
          // Continue even if embeddings fail, because the documents are processed
        }
        
        // Finish the preparation for better chatbot answers
        console.log("AI document processing completed successfully for project", projectId);
        return res.json({
          success: true,
          message: `AI processing completed successfully. Processed ${processedDocuments} of ${validDocuments} documents.`,
          stats: {
            documentCount: pdfs.length,
            validDocuments: validDocuments,
            processedDocuments: processedDocuments,
            totalContentLength: totalContentLength,
            processingResults: processingResults
          }
        });
      } catch (error: any) {
        console.error("Error in AI document processing:", error);
        return res.status(500).json({
          success: false,
          message: "Error in AI document processing: " + (error.message || "Unknown error"),
        });
      }
    } catch (error: any) {
      console.error("Error in learn-pdfs endpoint:", error);
      return res.status(500).json({
        success: false,
        message: "Error: " + (error.message || "Unknown error"),
      });
    }
  });
  
  // Helper for obtaining and setting the AI model based on the training options
  // Loads the project settings and initialises the appropriate AI model
  async function setupAIModelForProject(projectId: number) {
    console.log(`Setting up AI model for project ${projectId}`);
    try {
      // Get the project settings
      const options = await storage.getTrainingOptions(projectId);
      
      // Record which model the project uses
      console.log(`Project ${projectId} AI settings: `, options);
      
      // Detailed and balanced answer styles are treated as conversational mode.
      const isConversationalMode = options?.responseStyle === "detailed" || options?.responseStyle === "balanced";

      return {
        aiModel: "openai",
        conversationalMode: isConversationalMode
      };
    } catch (error: any) {
      console.error(`Error setting up AI model for project ${projectId}:`, error);
      return {
        aiModel: "local",
        conversationalMode: false
      };
    }
  }
  
  // Helper for obtaining the default prompt (without AI features)
  // This function exists only for backward compatibility
  function getEffectivePrompt(defaultPrompt: string, conversationalMode: boolean): string {
    return defaultPrompt;
  }
  
  // Endpoint for verifying the validity of an OpenAI API key
  app.post("/api/verify-openai-key", requireAuth, async (req, res) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey || typeof apiKey !== "string") {
        return res.status(400).json({
          success: false,
          message: "Missing API key, or it has an invalid format"
        });
      }

      // Import the API key verification function
      const { verifyOpenAIKey } = await import('./openaiModel');
      const isValid = await verifyOpenAIKey(apiKey);
      
      if (isValid) {
        return res.json({
          success: true,
          message: "The API key is valid"
        });
      } else {
        return res.json({
          success: false,
          message: "The API key is not valid; check it and try again"
        });
      }
    } catch (error: any) {
      console.error("Error verifying the API key:", error);
      return res.status(500).json({
        success: false,
        message: "Error verifying the API key"
      });
    }
  });

  // New endpoint for verifying various AI providers
  app.post("/api/verify-ai-provider", requireAuth, async (req, res) => {
    try {
      const { provider, apiKey, endpoint } = req.body;
      
      if (!provider || !apiKey) {
        return res.status(400).json({
          success: false,
          message: "The provider and API key are required"
        });
      }
      
      let isValid = false;
      let errorMessage = "";
      
      switch (provider) {
        case 'openai':
          try {
            if (!apiKey.startsWith('sk-')) {
              throw new Error("An OpenAI API key must start with 'sk-'");
            }
            
            const response = await fetch("https://api.openai.com/v1/models", {
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              }
            });
            
            if (response.ok) {
              isValid = true;
            } else {
              const errorData = await response.json().catch(() => ({}));
              errorMessage = "The API key is invalid, or you do not have access to the OpenAI API";
            }
          } catch (error: any) {
            errorMessage = error.message || "Error verifying the OpenAI API key";
          }
          break;
          
        case 'google':
          try {
            // Verify the Google AI API key
            const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
              method: 'GET',
              headers: {
                "Content-Type": "application/json"
              }
            });
            
            if (response.ok) {
              isValid = true;
            } else {
              const errorData = await response.json().catch(() => ({}));
              errorMessage = "The Google API key is invalid, or you do not have access to the Generative AI API";
            }
          } catch (error: any) {
            errorMessage = error.message || "Error verifying the Google API key";
          }
          break;
          
        case 'azure':
          try {
            if (!endpoint) {
              throw new Error("The Azure endpoint is required");
            }

            // The endpoint decides where the server sends its outbound request. Without validation
            // the application could be forced to call internal addresses (SSRF), so
            // we allow only HTTPS to the Azure OpenAI domain.
            if (!isAllowedAzureEndpoint(endpoint)) {
              throw new Error(
                "Invalid Azure endpoint. An HTTPS address of the form https://<name>.openai.azure.com is expected"
              );
            }

            // Verify the Azure OpenAI endpoint
            const testUrl = `${endpoint.replace(/\/$/, '')}/openai/deployments?api-version=2023-05-15`;
            const response = await fetch(testUrl, {
              headers: {
                "api-key": apiKey,
                "Content-Type": "application/json"
              }
            });
            
            if (response.ok) {
              isValid = true;
            } else {
              const errorData = await response.json().catch(() => ({}));
              errorMessage = "The Azure API key or endpoint is invalid";
            }
          } catch (error: any) {
            errorMessage = error.message || "Error verifying the Azure API key";
          }
          break;
          
        default:
          return res.status(400).json({
            success: false,
            message: "Unsupported AI provider"
          });
      }
      
      if (isValid) {
        return res.json({
          success: true,
          message: `The ${provider.toUpperCase()} API key is valid and working`
        });
      } else {
        return res.status(400).json({
          success: false,
          message: errorMessage
        });
      }
      
    } catch (error: any) {
      console.error("Error verifying AI provider:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while verifying the API key"
      });
    }
  });

  // Chat API endpoint - for dashboard testing as well as embedded chatbots
  app.post("/api/projects/:id/chat", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { message, sessionId } = req.body;
      
      if (!message || typeof message !== "string") {
        return res.status(400).json({
          message: "Missing message, or it has an invalid format",
        });
      }
      
      // Load the project and check the settings
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      let chatSessionId = sessionId;
      
      // Without a sessionId, create a new session
      if (!chatSessionId) {
        const newSession = await storage.createChatSession({
          projectId,
          visitorId: req.user ? `user_${req.user!.id}` : `visitor_${nanoid(8)}`,
        });
        chatSessionId = newSession.id;
      } else {
        // Update the existing session - if sessionId is a string, try to find or create a session
        const parsedSessionId = parseInt(chatSessionId);
        if (isNaN(parsedSessionId)) {
          // If sessionId is not a number, create a new session
          const newSession = await storage.createChatSession({
            projectId,
            visitorId: req.user ? `user_${req.user!.id}` : `visitor_${nanoid(8)}`,
          });
          chatSessionId = newSession.id;
        } else {
          await storage.updateChatSessionActivity(parsedSessionId);
          chatSessionId = parsedSessionId;
        }
      }
      
      // Load the chat history for better answer context
      const chatHistory = await storage.getChatMessages(chatSessionId);
      
      // Convert ChatMessage objects into the history format expected by OpenAI
      const formattedHistory = chatHistory.map(msg => ({
        role: msg.isFromUser ? 'user' as const : 'assistant' as const,
        content: msg.content
      }));
      
      // Get the answer according to the project settings - primarily via the OpenAI API
      let aiResponse;
      
      try {
        // First check whether PDF chunks with embeddings exist for semantic search
        const pdfChunks = await storage.getProjectPdfChunks(projectId);
        const hasSemanticsChunks = pdfChunks && pdfChunks.length > 0;
        
        // Load all PDFs from the project so they can be used as context
        const pdfs = await storage.getPdfs(projectId);
        
        // Get the content of all PDFs for use in the query
        const pdfContents = pdfs.map(pdf => pdf.content);
        
        // FLEXIBLE AI PROVIDER SYSTEM
        console.log(`[EMBED CHAT] Chunk check: ${hasSemanticsChunks ? 'PRESENT' : 'MISSING'}`);
        console.log(`[EMBED CHAT] AI Provider: ${project.aiProvider || 'openai'}, Model: ${project.aiModel || 'gpt-4'}`);
        console.log(`[EMBED CHAT] API keys: OpenAI=${project.openaiApiKey ? 'PRESENT' : 'MISSING'}, Google=${project.googleApiKey ? 'PRESENT' : 'MISSING'}, Azure=${project.azureEndpoint ? 'PRESENT' : 'MISSING'}`);
        
        try {
          // Determine the correct API key based on the provider
          const currentProvider = project.aiProvider || 'openai';
          let currentApiKey;
          
          switch (currentProvider) {
            case 'google':
              currentApiKey = project.googleApiKey;
              break;
            case 'azure':
              currentApiKey = project.openaiApiKey; // Azure uses an OpenAI-compatible key
              break;
            case 'openai':
            default:
              currentApiKey = project.openaiApiKey;
              break;
          }
          
          if (hasSemanticsChunks && currentApiKey) {
            console.log(`[EMBED CHAT] Using the NEW two-stage ${currentProvider.toUpperCase()} system for project ${projectId}`);
            
            // New two-stage system with a flexible AI provider
            const { DocumentProcessor } = await import('./services/documentProcessor');
            const result = await DocumentProcessor.findRelevantChunksAndRespond(
              message,
              projectId,
              project.defaultPrompt || undefined,
              // Carries the conversation context; see the note in the project chat.
              chatSessionId
            );
            
            aiResponse = result.response;
            console.log(`[EMBED CHAT] ✅ Answer generated via ${currentProvider}/${project.aiModel} - ${result.chunksUsed} chunks (${result.tokensUsed} tokens)`);
          } else {
            // Simple fallback using the flexible AI provider
            console.log(`[EMBED CHAT] Falling back to the conversational ${currentProvider} API`);
            const { generateFlexibleAIResponse } = await import('./openaiModel');
            
            aiResponse = await generateFlexibleAIResponse(
              message, 
              formattedHistory,
              {
                provider: currentProvider,
                apiKey: currentApiKey || undefined,
                model: project.aiModel || 'gpt-4',
                azureEndpoint: project.azureEndpoint || undefined,
                defaultPrompt: project.defaultPrompt || undefined
              }
            );
          }
        } catch (error: any) {
          console.error(`Error during chat processing:`, error);
          aiResponse = "I am sorry, an error occurred while processing your question.";
        }
        
        // Store the user's message in the database
        const userMessage = await storage.createChatMessage({
          sessionId: chatSessionId,
          content: message,
          isFromUser: true,
        });
        
        // Universal detection of unsuccessful answers
        console.log(`[FAILURE DETECTION DEBUG] Checking the answer: "${aiResponse.substring(0, 100)}..."`);
        const { checkAndLogFailedResponse } = await import('./services/failureDetection');
        await checkAndLogFailedResponse(aiResponse, projectId, chatSessionId, message);
        console.log(`[FAILURE DETECTION DEBUG] Detection finished for project ${projectId}`);
        
        // Store the answer in the database
        const botMessage = await storage.createChatMessage({
          sessionId: chatSessionId,
          content: aiResponse,
          isFromUser: false,
        });
        
        // API response
        res.json({
          message: botMessage,
          sessionId: chatSessionId,
        });
      } catch (error: any) {
        console.error("Error in chat processing:", error);
        return res.status(500).json({
          message: "Error processing the chat: " + (error as Error).message,
        });
      }
    } catch (outerError: any) {
      console.error("Outer error in chat processing:", outerError);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  });
  
  // Get chat sessions for a project
  app.get("/api/projects/:id/chat-sessions", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      if (isNaN(projectId)) {
        return res.status(400).json({
          message: "Invalid project ID",
        });
      }
      
      // Get the chat sessions for the project
      const sessions = await storage.getChatSessions(projectId, 50); // Limit raised to 50
      
      return res.json(sessions);
    } catch (error: any) {
      console.error("Error getting chat sessions:", error);
      return res.status(500).json({
        message: "Error retrieving the chat sessions: " + error.message,
      });
    }
  });
  
  // Get chat messages for a specific session
  app.get("/api/projects/:id/chat-sessions/:sessionId/messages", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      // Reads :sessionId, not :id. Copied from the line above, this used to
      // return the messages of whichever session happened to have the same id
      // as the project, no matter which conversation was asked for.
      const sessionId = parseInt(req.params.sessionId);

      if (isNaN(projectId) || isNaN(sessionId)) {
        return res.status(400).json({
          message: "Invalid project or session ID",
        });
      }
      
      // Verify that the session belongs to the project
      const sessions = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.projectId, projectId)
          )
        );
        
      if (sessions.length === 0) {
        return res.status(404).json({
          message: "The chat session was not found, or does not belong to this project",
        });
      }
      
      // Get the messages from the chat session
      const messages = await storage.getChatMessages(sessionId);
      
      return res.json(messages);
    } catch (error: any) {
      console.error("Error getting chat messages:", error);
      return res.status(500).json({
        message: "Error retrieving the chat messages: " + error.message,
      });
    }
  });
  
  // Get chat messages for a session
  app.get("/api/chat-sessions/:id/messages", checkChatSessionAccess, async (req, res) => {
    try {
      // checkChatSessionAccess has already resolved the session and authorised
      // the user against the project it belongs to.
      const messages = await storage.getChatMessages(req.chatSession!.id);

      return res.json(messages);
    } catch (error: any) {
      console.error("Error fetching chat messages:", error);
      return res.status(500).json({
        message: "An error occurred while loading the chat messages",
      });
    }
  });
  
  // Export chat history
  app.get("/api/chat-sessions/:id/export", checkChatSessionAccess, async (req, res) => {
    try {
      // checkChatSessionAccess has already resolved and authorised both.
      const chatSession = req.chatSession!;
      const project = req.project!;
      const sessionId = chatSession.id;
      const format = (req.query.format as string || 'json').toLowerCase();

      // Format verification
      const allowedFormats = ['json', 'csv', 'txt'];
      if (!allowedFormats.includes(format)) {
        return res.status(400).json({
          message: "Unsupported export format. Allowed formats: " + allowedFormats.join(', '),
        });
      }

      // Load the chat messages
      const messages = await storage.getChatMessages(sessionId);

      // Get the date and time for the file name
      const dateStr = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      let filename = `chat-export-${dateStr}`;
      let contentType = '';
      let content = '';
      
      // Prepare the export according to the chosen format
      if (format === 'json') {
        contentType = 'application/json';
        filename += '.json';
        
        // Export to JSON format with structured metadata
        const exportData = {
          metadata: {
            exportDate: new Date().toISOString(),
            projectName: project.name,
            sessionId: sessionId,
            messagesCount: messages.length,
            sessionCreated: chatSession.createdAt,
            sessionLastActive: chatSession.lastActiveAt
          },
          messages: messages.map(msg => ({
            id: msg.id,
            role: msg.isFromUser ? 'user' : 'assistant',
            content: msg.content,
            timestamp: msg.createdAt
          }))
        };
        
        content = JSON.stringify(exportData, null, 2);
      } 
      else if (format === 'csv') {
        contentType = 'text/csv';
        filename += '.csv';
        
        // CSV header
        content = 'ID,Role,Content,Timestamp\n';
        
        // Add the CSV rows
        for (const msg of messages) {
          const role = msg.isFromUser ? 'user' : 'assistant';
          // Escape content for CSV (wrap in quotes and double any quotes inside)
          const escapedContent = `"${msg.content.replace(/"/g, '""')}"`;
          content += `${msg.id},${role},${escapedContent},${msg.createdAt}\n`;
        }
      } 
      else if (format === 'txt') {
        contentType = 'text/plain';
        filename += '.txt';
        
        // Add the text file header
        content = `Export chatu z projektu: ${project.name}\n`;
        content += `Session ID: ${sessionId}\n`;
        content += `Created: ${chatSession.createdAt}\n`;
        content += `Last activity: ${chatSession.lastActiveAt}\n`;
        content += `Exported: ${new Date().toISOString()}\n`;
        content += `Message count: ${messages.length}\n\n`;
        content += `==================================================\n\n`;
        
        // Add the message contents
        for (const msg of messages) {
          const role = msg.isFromUser ? 'User' : 'Asistent';
          const timestamp = new Date(msg.createdAt).toLocaleString();
          content += `[${timestamp}] ${role}:\n${msg.content}\n\n`;
        }
      }
      
      // Set the headers for the file download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      return res.send(content);
    } catch (error: any) {
      console.error("Error exporting chat history:", error);
      return res.status(500).json({
        message: "An error occurred while exporting the chat history",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API endpoint for retrieving API details (key, settings)
  app.get("/api/projects/:id/api-details", checkProjectAccess, async (req, res) => {
    try {
      // The project is loaded by the checkProjectAccess middleware
      if (!req.project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may manage API keys",
        });
      }
      
      // Return the current API key and settings
      return res.json({
        apiKey: req.project!.apiKey || null,
        apiEnabled: !!req.project!.apiEnabled,
        apiRateLimit: req.project!.apiRateLimit || 100,
      });
    } catch (error: any) {
      console.error("Error getting API details:", error);
      return res.status(500).json({
        message: "An error occurred while retrieving the API details",
      });
    }
  });

  // NOTE: /api/projects/:id/api-key/generate and /api/projects/:id/api-settings
  // used to be implemented a second time here. setupProjectApiRoutes() is called
  // near the top of registerRoutes even though it is defined much further down,
  // so its legacy stubs registered first and these copies never ran. The
  // canonical implementations live on apiManagementRouter, under
  // /api/projects/:id/api/key/generate and /api/projects/:id/api/settings.

  // API endpoint for retrieving API call statistics
  app.get("/api/projects/:id/api-stats", checkProjectAccess, async (req, res) => {
    try {
      // The project is loaded by the checkProjectAccess middleware
      if (!req.project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may view the API statistics",
        });
      }
      
      // Get the total number of calls
      const totalCallsResult = await db.select({ count: sql`count(*)` })
        .from(apiCalls)
        .where(eq(apiCalls.projectId, req.project!.id));
      
      const totalCalls = Number(totalCallsResult[0]?.count || 0);
      
      // Get the number of calls made today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      // `conditionA && conditionB` would return only the second operand in JS –
      // conditions must be composed with and().
      const todayCallsResult = await db.select({ count: sql`count(*)` })
        .from(apiCalls)
        .where(
          and(
            eq(apiCalls.projectId, req.project!.id),
            gte(apiCalls.createdAt, todayStart)
          )
        );

      const todayCalls = Number(todayCallsResult[0]?.count || 0);

      // Get the call success rate (successful calls divided by the total)
      const successCallsResult = await db.select({ count: sql`count(*)` })
        .from(apiCalls)
        .where(
          and(
            eq(apiCalls.projectId, req.project!.id),
            eq(apiCalls.success, true)
          )
        );
      
      const successCalls = Number(successCallsResult[0]?.count || 0);
      const successRate = totalCalls > 0 ? successCalls / totalCalls : 1;
      
      // Return the statistics
      return res.json({
        totalCalls,
        todayCalls,
        successCalls,
        successRate,
        rateLimit: req.project!.apiRateLimit || 100,
      });
    } catch (error: any) {
      console.error("Error getting API stats:", error);
      return res.status(500).json({
        message: "An error occurred while retrieving the API statistics",
      });
    }
  });
  
  // API endpoint for retrieving API call history
  app.get("/api/projects/:id/api-calls", checkProjectAccess, async (req, res) => {
    try {
      // The project is loaded by the checkProjectAccess middleware
      if (!req.project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may view the API call history",
        });
      }
      
      // Limit and offset for pagination
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      
      // Get the call history for the given project (newest first)
      const apiCallHistory = await db.select()
        .from(apiCalls)
        .where(eq(apiCalls.projectId, req.project!.id))
        .orderBy(desc(apiCalls.createdAt))
        .limit(limit)
        .offset(offset);
      
      // Return the call history
      return res.json(apiCallHistory);
    } catch (error: any) {
      console.error("Error getting API call history:", error);
      return res.status(500).json({
        message: "An error occurred while retrieving the API call history",
      });
    }
  });
  
  // Function for setting up the API routers that manage a project's API settings
  function setupProjectApiRoutes(app: Express) {
    // Create the router for API management
    const apiManagementRouter = express.Router({ mergeParams: true });
    
    // All routes go through the project access check
    apiManagementRouter.use(checkProjectAccess);
    
    // API endpoint for retrieving API call statistics
    apiManagementRouter.get("/stats", async (req, res) => {
      try {
        // The project is loaded by the checkProjectAccess middleware
        if (!req.project) {
          return res.status(404).json({
            message: "Projekt nebyl nalezen",
          });
        }
        
        // Check whether the user owns the project
        if (req.project!.ownerId !== req.user!.id) {
          return res.status(403).json({
            message: "Only the project owner may view the API statistics",
          });
        }
        
        // Get the total number of calls
        const totalCallsResult = await db.select({ count: sql`count(*)` })
          .from(apiCalls)
          .where(eq(apiCalls.projectId, req.project!.id));
        
        const totalCalls = Number(totalCallsResult[0]?.count || 0);
        
        // Get the number of calls made today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayCallsResult = await db.select({ count: sql`count(*)` })
          .from(apiCalls)
          .where(
            and(
              eq(apiCalls.projectId, req.project!.id),
              gte(apiCalls.createdAt, todayStart)
            )
          );
        
        const todayCalls = Number(todayCallsResult[0]?.count || 0);
        
        // Get the call success rate (successful calls divided by the total)
        const successCallsResult = await db.select({ count: sql`count(*)` })
          .from(apiCalls)
          .where(
            and(
              eq(apiCalls.projectId, req.project!.id),
              eq(apiCalls.success, true)
            )
          );
        
        const successCalls = Number(successCallsResult[0]?.count || 0);
        const successRate = totalCalls > 0 ? successCalls / totalCalls : 1;
        
        // Return the statistics
        return res.json({
          totalCalls,
          todayCalls,
          successCalls,
          successRate,
          rateLimit: req.project!.apiRateLimit || 100,
        });
      } catch (error: any) {
        console.error("Error getting API stats:", error);
        return res.status(500).json({
          message: "An error occurred while retrieving the API statistics",
        });
      }
    });
    
    // API endpoint for retrieving API call history
    apiManagementRouter.get("/calls", async (req, res) => {
      try {
        // The project is loaded by the checkProjectAccess middleware
        if (!req.project) {
          return res.status(404).json({
            message: "Projekt nebyl nalezen",
          });
        }
        
        // Check whether the user owns the project
        if (req.project!.ownerId !== req.user!.id) {
          return res.status(403).json({
            message: "Only the project owner may view the API call history",
          });
        }
        
        // Limit and offset for pagination
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
        
        // Get the call history for the given project (newest first)
        const apiCallHistory = await db.select()
          .from(apiCalls)
          .where(eq(apiCalls.projectId, req.project!.id))
          .orderBy(desc(apiCalls.createdAt))
          .limit(limit)
          .offset(offset);
        
        // Return the call history
        return res.json(apiCallHistory);
      } catch (error: any) {
        console.error("Error getting API call history:", error);
        return res.status(500).json({
          message: "An error occurred while retrieving the API call history",
        });
      }
    });
    
    // API endpoint for retrieving a project's API details
    apiManagementRouter.get("/", async (req, res) => {
      try {
        // The project is loaded by the checkProjectAccess middleware
        if (!req.project) {
          return res.status(404).json({
            message: "Projekt nebyl nalezen",
          });
        }
        
        // Only the project owner may view or edit the API settings
        if (req.project!.ownerId !== req.user!.id) {
          return res.status(403).json({
            message: "Only the project owner may manage the API settings",
          });
        }
        
        // Return basic information about the API configuration
        return res.json({
          apiKey: req.project!.apiKey,
          apiEnabled: req.project!.apiEnabled || false,
          apiRateLimit: req.project!.apiRateLimit || 100
        });
      } catch (error: any) {
        console.error("Error getting API details:", error);
        return res.status(500).json({
          message: "An error occurred while retrieving the API details",
        });
      }
    });
    
    // API endpoint for generating a new API key
    apiManagementRouter.post("/key/generate", async (req, res) => {
      try {
        // The project is loaded by the checkProjectAccess middleware
        if (!req.project) {
          return res.status(404).json({
            message: "Projekt nebyl nalezen",
          });
        }
        
        // Only the project owner may generate an API key
        if (req.project!.ownerId !== req.user!.id) {
          return res.status(403).json({
            message: "Only the project owner may generate an API key",
          });
        }
        
        // Generate a new API key
        const apiKey = generateApiKey();
        
        // Aktualizujeme projekt
        const updatedProject = await storage.updateProject(req.project!.id, { apiKey });
        
        // Return the new API key
        return res.json({
          apiKey,
          message: "The API key has been generated"
        });
      } catch (error: any) {
        console.error("Error generating API key:", error);
        return res.status(500).json({
          message: "An error occurred while generating the API key",
        });
      }
    });
    
    // API endpoint for updating API settings
    apiManagementRouter.patch("/settings", async (req, res) => {
      try {
        // The project is loaded by the checkProjectAccess middleware
        if (!req.project) {
          return res.status(404).json({
            message: "Projekt nebyl nalezen",
          });
        }
        
        // Only the project owner may update the API settings
        if (req.project!.ownerId !== req.user!.id) {
          return res.status(403).json({
            message: "Only the project owner may edit the API settings",
          });
        }
        
        const { apiEnabled, apiRateLimit } = req.body;
        
        // Prepare the update
        const updateData: any = {};
        
        // Add the data to be updated
        if (typeof apiEnabled === 'boolean') {
          updateData.apiEnabled = apiEnabled;
        }
        
        if (apiRateLimit && Number.isInteger(Number(apiRateLimit))) {
          updateData.apiRateLimit = Number(apiRateLimit);
        }
        
        // Aktualizujeme projekt
        const updatedProject = await storage.updateProject(req.project!.id, updateData);
        
        // Return the updated API details
        return res.json({
          apiKey: updatedProject.apiKey,
          apiEnabled: updatedProject.apiEnabled || false, 
          apiRateLimit: updatedProject.apiRateLimit || 100,
          message: "The API settings have been updated"
        });
      } catch (error: any) {
        console.error("Error updating API settings:", error);
        return res.status(500).json({
          message: "An error occurred while updating the API settings",
        });
      }
    });
    
    // Registrujeme router pod cestou /api/projects/:id/api
    app.use("/api/projects/:id/api", apiManagementRouter);
    
    // Preserve backward compatibility for the existing endpoints
    // API endpoint for retrieving API call statistics (legacy)
    app.get("/api/projects/:id/api-stats", checkProjectAccess, (req, res) => {
      const projectId = req.params.id;
      res.redirect(`/api/projects/${projectId}/api/stats`);
    });
    
    // API endpoint for retrieving API call history (legacy)
    app.get("/api/projects/:id/api-calls", checkProjectAccess, (req, res) => {
      const projectId = req.params.id;
      res.redirect(`/api/projects/${projectId}/api/calls`);
    });
    
    // API endpoint for retrieving a project's API details (legacy)
    app.get("/api/projects/:id/api-details", checkProjectAccess, (req, res) => {
      const projectId = req.params.id;
      res.redirect(`/api/projects/${projectId}/api`);
    });
    
    // API endpoint for generating a new API key (legacy)
    //
    // 307 rather than the usual 302: it is the only redirect status that keeps
    // the method and body intact, so a POST stays a POST. These two used to
    // rewrite req.url and call next('route'), which cannot work — next('route')
    // moves forward through the stack, and the router being aimed at was
    // registered earlier, so every request fell through to the catch-all 404.
    app.post("/api/projects/:id/api-key/generate", checkProjectAccess, (req, res) => {
      res.redirect(307, `/api/projects/${req.params.id}/api/key/generate`);
    });

    // API endpoint for updating API settings (legacy)
    app.patch("/api/projects/:id/api-settings", checkProjectAccess, (req, res) => {
      res.redirect(307, `/api/projects/${req.params.id}/api/settings`);
    });
  }

  
  // Get embed code for a project
  
  // Get embed code for a project
  app.get("/api/projects/:id/embed-code", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Get the project from the database
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      // If the project has no embedToken, generate one
      if (!project.embedToken) {
        const embedToken = nanoid();
        await storage.updateProject(projectId, { embedToken });
      }
      
      // Generate the embed snippet - customised by every available parameter
      // Use an absolute URL for embed.js so the script is always loaded from our domain
      
      // First obtain the current base URL for the embed script
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
      
      // Decide intelligently which URL to use
      let baseUrl;
      
      // Check whether we are in production or development
      if (host.includes('docusage.cz')) {
        // We are directly on the production domain
        baseUrl = "https://docusage.cz";
      } else if (host.includes('localhost') || host.includes('127.0.0.1')) {
        // We are in the local development environment
        baseUrl = `${protocol}://${host}`;
        console.log(`Local environment detected, using the local URL: ${baseUrl}`);
      } else {
        // Another environment - we are unsure, so use the production URL to be safe
        baseUrl = "https://docusage.cz";
        console.log(`Unknown environment (${host}), using the production URL: ${baseUrl}`);
      }
      
      // If the development environment is set explicitly and we are not in production, use the current URL
      if (process.env.NODE_ENV === "development" && !host.includes('docusage.cz')) {
        baseUrl = `${protocol}://${host}`;
        console.log(`Development environment, using the URL: ${baseUrl}`);
      }
      
      // All parameters including notifications
      const notificationParams = project.notificationEnabled 
        ? `
  data-notification-enabled="true"
  data-notification-delay="${project.notificationDelay || 15}"
  data-notification-text="${project.notificationText || 'Need help with anything?'}"` 
        : '';

      // Determine the correct embed script based on the style
      const embedStyle = project.embedStyle || 'classic';
      let embedScriptPath = '/embed.js';
      if (embedStyle === 'advanced') {
        embedScriptPath = '/embed-advanced.js';
      } else if (embedStyle === 'premium') {
        embedScriptPath = '/embed-premium.js';

      }

      // Rating parametre
      const ratingParams = project.ratingEnabled 
        ? `
  data-rating-enabled="true"
  data-rating-prompt="${project.ratingPromptMessage || 'Jak byste ohodnotili tuto konverzaci?'}"
  data-rating-thank-you="${project.ratingThankYouMessage || 'Thank you for your rating!'}"` 
        : '';

      const embedCode = `<!-- DocuSage AI Assistant -->
<script src="${baseUrl}${embedScriptPath}" 
  data-token="${project.embedToken}" 
  data-color="${project.colorTheme || 'blue'}" 
  data-theme="light"
  data-style="${embedStyle}"
  data-chatbot-name="${project.chatbotName || 'DocuSage Asistent'}"
  data-welcome-message="${project.welcomeMessage || 'Hi, feel free to ask a question here'}"
  data-disclaimer-text="${project.embedDisclaimer || 'Answers are generated by AI and may not always be accurate'}"
  data-hide-powered-by="${project.hidePoweredBy || false}"${notificationParams}${ratingParams}
></script>
<!-- End DocuSage AI Assistant -->`;
      
      return res.json({ embedCode });
    } catch (error: any) {
      console.error("Error generating embed code:", error);
      return res.status(500).json({
        message: "An error occurred while generating the embed snippet",
      });
    }
  });
  
  // ==========================================
  // BRAND NEW CORS ENDPOINT FOR THE EMBED CHAT
  // ==========================================
  
  // Note: routing for /api/chat-embed was moved to index.ts
  // to correctly resolve the CORS problem for origin 'null'

  // REMOVE THIS ENDPOINT - we use the new router above
  /*
  app.post("/api/chat-embed", async (req, res) => {
    // CORS headers are already set by the middleware above
    
    try {
      const { message, token, sessionId } = req.body;
      
      if (!message || !token) {
        return res.status(400).json({
          message: "Missing message or token",
        });
      }
      
      // Najdeme projekt podle token
      console.log('Chat embed: looking up the project by token:', token);
      const projects = await storage.getProjects();
      console.log('Chat embed: total number of projects:', projects.length);
      
      const project = projects.find(p => p.embedToken === token);
      
      if (!project) {
        // If the project was not found, print all tokens for easier diagnostics
        console.log('Chat embed: token not found. Available tokens:', 
          projects.map(p => ({id: p.id, token: p.embedToken || 'undefined'}))
        );
        
        return res.status(404).json({
          message: "Invalid embed token",
        });
      }
      
      console.log('Chat embed: Projekt nalezen, ID:', project.id);
      
      console.log(`Processing embedded chat for project ${project.id} with token ${token}`);
      
      let chatSessionId = sessionId;
      
      // Without a sessionId, create a new session
      if (!chatSessionId) {
        // Use the visitorId from the request, or generate a new one if absent
        const visitorId = req.body.visitorId || `embed_${nanoid(8)}`;
        
        const newSession = await storage.createChatSession({
          projectId: project.id,
          visitorId: visitorId,
        });
        chatSessionId = newSession.id;
      } else {
        // Update the existing session
        await storage.updateChatSessionActivity(chatSessionId);
      }
      
      // Use our conversational AI model to generate the answer
      console.log("Chat embed session:", chatSessionId, "- Using conversational AI model");
      
      // Load the chat history for better answer context
      const chatHistory = await storage.getChatMessages(chatSessionId);
      
      // Determine which AI model to use for this project
      let aiResponse;
      
      // Determine whether the project has its own OpenAI key
      if (project.openaiApiKey) {
        console.log(`Using the OpenAI API for the embedded chat of project ${project.id}`);
        const { generateChatCompletion } = await import('./openaiModel');
        aiResponse = await generateChatCompletion(message, chatHistory, {
          apiKey: project.openaiApiKey,
          customPrompt: project.defaultPrompt || SIMPLE_ASSISTANT_PROMPT
        });
      } else {
        // Fall back to the original model
        console.log(`Using the local model for the embedded chat of project ${project.id}`);
        // Conversational AI functionality moved to services/documentProcessor
        aiResponse = // Conversational response disabled
      }
      
      // Store the user's message in the database
      const userMessage = await storage.createChatMessage({
        sessionId: chatSessionId,
        content: message,
        isFromUser: true,
      });
      
      // Store the answer in the database
      const botMessage = await storage.createChatMessage({
        sessionId: chatSessionId,
        content: aiResponse,
        isFromUser: false,
      });
      
      // API response
      return res.json({
        message: botMessage,
        sessionId: chatSessionId,
      });
    } catch (error: any) {
      console.error("Error in embedded chat processing:", error);
      return res.status(500).json({
        message: "Error processing the chat: " + error.message,
      });
    }
  });
  */
  
  // Get team members of a project
  app.get("/api/projects/:id/team", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Load the team members
      const teamMembers = await storage.getTeamMembers(projectId);
      
      return res.json(teamMembers);
    } catch (error: any) {
      console.error("Error fetching team members:", error);
      return res.status(500).json({
        message: "An error occurred while loading the team members",
      });
    }
  });

  // Active users collaboration endpoint
  app.get("/api/projects/:id/active-users", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const activeUsers = await storage.getActiveUsersForProject(projectId, 5); // 5 minutes threshold
      res.json(activeUsers);
    } catch (error: any) {
      console.error('Error fetching active users:', error);
      res.status(500).json({ error: 'Failed to fetch active users' });
    }
  });

  // Track user activity endpoint
  app.post("/api/projects/:id/track-activity", requireAuth, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { activityType = 'viewing', sessionId } = req.body;
      
      // Verify user has access to this project
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      // Check if user owns the project or is a team member
      const isOwner = project.ownerId === req.user!.id;
      const teamMembers = await storage.getTeamMembers(projectId);
      const isMember = teamMembers.some(member => member.userId === req.user!.id);
      
      if (!isOwner && !isMember) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const success = await storage.trackUserActivity(req.user!.id, projectId, activityType, sessionId);
      
      if (success) {
        res.json({ success: true, message: 'Activity tracked' });
      } else {
        res.status(500).json({ error: 'Failed to track activity' });
      }
    } catch (error: any) {
      console.error('Error tracking user activity:', error);
      res.status(500).json({ error: 'Failed to track activity' });
    }
  });

  // Set user inactive endpoint
  app.post("/api/projects/:id/set-inactive", requireAuth, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const { sessionId } = req.body;
      
      await storage.setUserInactive(req.user!.id, projectId, sessionId);
      res.json({ success: true, message: 'User set as inactive' });
    } catch (error: any) {
      console.error('Error setting user inactive:', error);
      res.status(500).json({ error: 'Failed to set user inactive' });
    }
  });
  
  // Add team member to a project
  app.post("/api/projects/:id/team", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may add team members",
        });
      }
      
      const { email, role } = req.body;
      
      if (!email || !role) {
        return res.status(400).json({
          message: "Missing email or role",
        });
      }
      
      // Check that the role is valid
      if (!['editor', 'viewer'].includes(role)) {
        return res.status(400).json({
          message: "Invalid role. Allowed values: editor, viewer",
        });
      }
      
      // Find the user by email
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({
          message: "No user with this email was found",
        });
      }
      
      // Check that the user is not already a team member
      const teamMembers = await storage.getTeamMembers(projectId);
      const existingMember = teamMembers.find(tm => tm.userId === user.id);
      
      if (existingMember) {
        return res.status(400).json({
          message: "The user is already a team member",
        });
      }
      
      // Add a user to the team
      const teamMember = await storage.addTeamMember({
        projectId,
        userId: user.id,
        role: role as any,
      });
      
      return res.status(201).json(teamMember);
    } catch (error: any) {
      console.error("Error adding team member:", error);
      return res.status(500).json({
        message: "An error occurred while adding the team member",
      });
    }
  });
  
  // Remove team member from a project
  app.delete("/api/projects/:id/team/:userId", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may remove team members",
        });
      }
      
      // Check that the user is not removing themselves (the owner)
      if (userId === req.user!.id) {
        return res.status(400).json({
          message: "You cannot remove yourself from the team (the project owner)",
        });
      }
      
      // Remove a user from the team
      const success = await storage.removeTeamMember(projectId, userId);
      
      if (!success) {
        return res.status(404).json({
          message: "Team member not found",
        });
      }
      
      return res.status(204).end();
    } catch (error: any) {
      console.error("Error removing team member:", error);
      return res.status(500).json({
        message: "An error occurred while removing the team member",
      });
    }
  });
  
  // Update team member role
  app.patch("/api/projects/:id/team/:userId", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);
      
      // Check whether the user owns the project
      if (req.project!.ownerId !== req.user!.id) {
        return res.status(403).json({
          message: "Only the project owner may change team member roles",
        });
      }
      
      const { role } = req.body;
      
      if (!role) {
        return res.status(400).json({
          message: "Missing role",
        });
      }
      
      // Check that the role is valid
      if (!['editor', 'viewer'].includes(role)) {
        return res.status(400).json({
          message: "Invalid role. Allowed values: editor, viewer",
        });
      }
      
      // Update a team member's role
      const teamMember = await storage.updateTeamMemberRole(projectId, userId, role as any);
      
      if (!teamMember) {
        return res.status(404).json({
          message: "Team member not found",
        });
      }
      
      return res.json(teamMember);
    } catch (error: any) {
      console.error("Error updating team member role:", error);
      return res.status(500).json({
        message: "An error occurred while updating the team member's role",
      });
    }
  });
  
  // Training options endpoints - temporarily return default values only
  app.get("/api/projects/:id/training-options", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Return the basic settings (without AI features)
      const defaults: ProjectTrainingOptions = {
        contextSize: 2048,
        responseStyle: "balanced",
        useKeywordsExtraction: false,
        useSemanticSearch: false,
        maxDocuments: 5,
        documentChunkSize: 1000,
        enableCitationGeneration: false,
        temperatureValue: 0.7,
        customStopWords: undefined,
        customPromptTemplate: undefined
      };
      
      return res.json(defaults);
    } catch (error: any) {
      console.error("Error fetching training options:", error);
      return res.status(500).json({
        message: "Error loading the training settings"
      });
    }
  });
  
  app.put("/api/projects/:id/training-options", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Notice that training settings are not supported in this version
      return res.status(200).json({ 
        message: "Training settings are not supported in this version",
        contextSize: 2048,
        responseStyle: "balanced",
        useKeywordsExtraction: false,
        useSemanticSearch: false,
        maxDocuments: 5,
        documentChunkSize: 1000,
        enableCitationGeneration: false,
        temperatureValue: 0.7,
        customStopWords: undefined,
        customPromptTemplate: undefined
      });
    } catch (error: any) {
      console.error("Error updating training options:", error);
      return res.status(500).json({
        message: "Error updating the training settings"
      });
    }
  });
  
  // NOTE: setupPublicApiEndpoints() used to be called here. It mounted a second,
  // trimmed-down copy of the /api/p/:id router, which could never win a request
  // because setupApiRoutes() had already mounted the full one. Around 180 lines
  // of unreachable code, and one of the reasons the shadowing bug in the public
  // API went unnoticed for so long.

  // API endpoint for retrieving the most frequently searched topics of a project
  app.get("/api/projects/:id/topics", checkProjectAccess, async (req, res) => {
    try {
      const projectId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string || '10');
      
      // Import the topic analysis module
      // Topic analysis deprecated
      
      // Get the most frequent query topics for the project
      const topics = await Promise.resolve([]);
      
      return res.json(topics);
    } catch (error: any) {
      console.error('Error retrieving the query topics:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // API endpoint for retrieving queries for a specific topic
  app.get("/api/topics/:id/queries", async (req, res) => {
    // Verify that the user is logged in
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "You are not logged in" });
    }
    try {
      const topicId = parseInt(req.params.id);
      
      if (isNaN(topicId)) {
        return res.status(400).json({
          message: "Invalid topic ID",
        });
      }
      
      // First verify that the topic exists
      const [topic] = await db
        .select()
        .from(queryTopics)
        .where(eq(queryTopics.id, topicId));
      
      if (!topic) {
        return res.status(404).json({
          message: "Topic not found",
        });
      }
      
      // Verify that the user has access to the project the topic belongs to
      const project = await storage.getProject(topic.projectId);
      
      if (!project) {
        return res.status(404).json({
          message: "Projekt nebyl nalezen",
        });
      }
      
      // Check whether the user has access to the project
      const userId = req.user?.id;
      
      if (project.ownerId !== userId) {
        // The user is not the owner; check whether they are a team member
        const teamMembers = await storage.getTeamMembers(project.id);
        const isTeamMember = teamMembers.some(member => member.userId === userId);
        
        if (!isTeamMember) {
          return res.status(403).json({
            message: "You do not have access to this topic",
          });
        }
      }
      
      const limit = parseInt(req.query.limit as string || '20');
      
      // Import the topic analysis module
      // Topic analysis deprecated
      
      // Get the queries for the given topic
      const queries = await Promise.resolve([]);
      
      return res.json(queries);
    } catch (error: any) {
      console.error('Error retrieving the queries for the topic:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Serve static files from the icons directory
  app.use("/icons", express.static(path.join(process.cwd(), "icons")));
  
  // Create the HTTP server
  const httpServer = createServer(app);
  
  return httpServer;
}
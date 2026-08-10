import { CONVERSATIONAL_ASSISTANT_PROMPT, SIMPLE_ASSISTANT_PROMPT } from './prompts';
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import { Router } from "express";
import { nanoid } from "nanoid";
import { storage } from "./storage";
import path from "path";

const app = express();

/**
 * Cap for JSON/urlencoded request bodies. Express defaults to 100 kB;
 * we stay close to it so the server cannot be flooded with huge request bodies. File
 * uploads go through multer, which this limit does not apply to.
 */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '200kb';

// A dedicated router for the embedded chatbot, used outside the global CORS middleware
const chatEmbedRouter = Router();

// CORS for the nested /api/chat-embed path, which has special handling for origin 'null'
// chatEmbedRouter is initialised in index.ts (rather than routes.ts) so CORS registers correctly
// Function for setting the CORS headers

// Initialize embed tokens for projects
storage.getProjects().then(projects => {
  // Verify embed tokens are properly set for all projects
  projects.forEach(p => {
    if (!p.embedToken) {
      console.warn(`Project ${p.id} (${p.name}) missing embed token`);
    }
  });
}).catch(err => {
  console.error("Error checking embed tokens:", err);
});
/**
 * CORS headers for the embed widget.
 *
 * The widget runs on any third-party domain (and when opened from `file://` it sends
 * origin `null`), so we must allow all origins. It authenticates solely with
 * the project token in the request body – which is why we DELIBERATELY do not send
 * `Access-Control-Allow-Credentials`. The combination of a mirrored origin
 * and allowed cookies would turn every third-party site into a trusted source of
 * requests on behalf of the logged-in user.
 */
function setCorsHeaders(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// OPTIONS endpoint for CORS preflight requests
chatEmbedRouter.options('/', (req: Request, res: Response) => {
  console.log('CORS EMBED INDEX: OPTIONS request from origin:', req.headers.origin);
  setCorsHeaders(req, res);
  return res.status(204).end();
});

// POST endpoint pro chat
chatEmbedRouter.post('/', async (req: Request, res: Response) => {
  console.log('CORS EMBED INDEX: POST request from origin:', req.headers.origin);
  // Set the CORS headers for POST
  setCorsHeaders(req, res);
  
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
    console.log("Chat embed session:", chatSessionId, "- Using conversational AI model");
    
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
          console.log(`Using the OpenAI API with semantic search for the embedded chat of project ${project.id} (${pdfChunks.length} chunks)`);
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
          console.log(`Using the OpenAI API with PDF context for the embedded chat of project ${project.id} (${pdfs.length} documents) - no PDF chunks available`);
          const { generateChatCompletionWithPDFs } = await import('./openaiModel');
          const pdfContents = pdfs.map(pdf => pdf.content);
          
          // Generate an answer with the PDF documents as context
          aiResponse = await generateChatCompletionWithPDFs(
            message,
            pdfContents,
            chatHistory,
            {
              apiKey: project.openaiApiKey,
              defaultPrompt: project.defaultPrompt || CONVERSATIONAL_ASSISTANT_PROMPT,
              projectId: project.id
            }
          );
        }
      } else {
        // With no PDF documents, use the standard chat
        console.log(`Using the OpenAI API (without PDF context) for the embedded chat of project ${project.id}`);
        const { generateChatCompletion } = await import('./openaiModel');
        aiResponse = await generateChatCompletion(message, chatHistory, {
          apiKey: project.openaiApiKey,
          customPrompt: project.defaultPrompt || SIMPLE_ASSISTANT_PROMPT
        });
      }
    } else {
      // Fall back to the original model
      console.log(`Using the local model for the embedded chat of project ${project.id}`);
      // Conversational AI functionality moved to services/documentProcessor
      // Use DocumentProcessor for conversation functionality
      const { DocumentProcessor } = await import('./services/documentProcessor');
      const result = await DocumentProcessor.findRelevantChunksAndRespond(message, project.id);
      aiResponse = result.response;
    }
    
    // Store the user's message in the database
    const userMessage = await storage.createChatMessage({
      sessionId: parseInt(chatSessionId.toString()),
      content: message,
      isFromUser: true,
    });
    
    // Store the answer in the database
    const botMessage = await storage.createChatMessage({
      sessionId: parseInt(chatSessionId.toString()),
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

// Rating API endpoint for embed widgets
chatEmbedRouter.post('/rating', async (req, res) => {
  console.log("⭐ Rating API received request:", {
    hasToken: !!req.body?.token,
    hasSessionId: !!req.body?.sessionId,
    hasRating: !!req.body?.rating,
    timestamp: new Date().toISOString()
  });

  try {
    const { token, sessionId, rating } = req.body;

    if (!token || !sessionId || rating === undefined) {
      return res.status(400).json({ 
        error: 'Missing required parameters (token, sessionId, rating)' 
      });
    }

    // Validate rating value (1-5 stars)
    const ratingValue = parseInt(rating);
    if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ 
        error: 'The rating must be a number between 1 and 5' 
      });
    }

    // Find project by token
    const project = await storage.getProjectByToken(token);
    if (!project) {
      console.warn("⚠️ Rating API: no project found for token:", token);
      return res.status(404).json({ error: 'Projekt nebyl nalezen' });
    }

    // Update session rating
    await storage.updateChatSessionRating(sessionId, ratingValue);

    console.log("✅ Rating successfully saved:", { 
      sessionId, 
      rating: ratingValue, 
      projectId: project.id 
    });

    res.json({ success: true, message: 'The rating has been saved' });
  } catch (error: any) {
    console.error('❌ Rating API error:', error);
    res.status(500).json({ 
      error: 'Error saving the rating',
      details: error.message 
    });
  }
});

// Explicit CORS middleware for the bot icon endpoint (highest priority)
app.use((req, res, next) => {
  if (req.path.includes('/bot-icon')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }

  next();
});

// First add the middleware for parsing JSON data
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));

/**
 * CORS is split into two zones because their security requirements differ entirely:
 *
 * 1) PUBLIC ZONE (embed widget, public API) – runs on third-party domains, so it
 *    must be open to all origins. It authenticates with a project token or
 *    the X-API-Key header, NEVER a cookie. Hence `credentials: false` – the browser
 *    will not attach the session cookie to these endpoints at all.
 *
 * 2) PRIVATE ZONE (administration, project management) – authenticates with a session
 *    cookie. Here, reflecting an arbitrary origin together with `credentials: true`
 *    is dangerous, so we only allow explicitly configured origin(s).
 *    Configure them via ALLOWED_ORIGINS (comma-separated), or they are derived
 *    from APP_URL. In development mode localhost is additionally allowed.
 */
const PUBLIC_CORS_PATHS = ['/api/chat-embed', '/api/p/', '/bot-icon'];

const configuredOrigins = (process.env.ALLOWED_ORIGINS || process.env.APP_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const publicCors = cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
  maxAge: 86400,
});

const privateCors = cors({
  origin(origin, callback) {
    // Requests without an Origin header (same-origin, curl, server-to-server) are allowed through.
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/$/, '');

    if (configuredOrigins.includes(normalized)) {
      return callback(null, true);
    }

    // In development we allow localhost so nothing needs configuring.
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Rejected origin: ${origin}. Add it to ALLOWED_ORIGINS.`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

app.use((req, res, next) => {
  const isPublic = PUBLIC_CORS_PATHS.some((prefix) => req.path.startsWith(prefix) || req.path.includes(prefix));
  return isPublic ? publicCors(req, res, next) : privateCors(req, res, next);
});

// Import the API routers with the OpenAI endpoints and the public API endpoints
import apiRouter from './apiRoutes';
import publicApiRouter from './publicApiRoutes';

// Register the chat embed router with its own CORS settings after the main CORS
app.use('/api/chat-embed', chatEmbedRouter);

// Register the API router for the OpenAI endpoints and the public API endpoints
app.use('/api', apiRouter);
app.use('/api', publicApiRouter);

// Add the middleware that carries cookie and session information
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Let the CORS handlers set the correct headers,
  // so we do not add any further CORS headers here
  
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
      
      // Print session and cookie information for diagnostics
      if (req.sessionID) {
        log(`Session ID: ${req.sessionID}`);
      }
      if (req.headers.cookie) {
        log(`Cookies: ${req.headers.cookie}`);
      }
    }
  });

  next();
});

// Importujeme setup pro autentizaci
import { setupAuth } from "./auth";

// Nastavujeme autentizaci
setupAuth(app);

// Add static serving for the icons directory
app.use('/icons', express.static(path.join(process.cwd(), 'icons')));

// Importujeme funkcie pre nastavenie API routerov
import { setupApiRoutes } from "./routes";

// Register the project API endpoints BEFORE the vite middleware
setupApiRoutes(app);

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Log the error in full, but send out only a safe message –
    // internal error details (stack, SQL, paths) are not for the client.
    console.error("Unhandled request error:", err);

    const message = status >= 500
      ? "Internal server error"
      : (err.message || "Bad request");

    if (!res.headersSent) {
      res.status(status).json({ message });
    }

    // NOTE: the previous `throw err` here crashed the whole process – inside an error handler
    // there is nobody left to catch the exception. A single request error therefore
    // meant a server outage.
  });

  // Unknown /api/* paths must end as a JSON 404. Without this they would be caught by
  // the SPA fallback below and returned index.html with status 200 – the client would then
  // parse HTML as JSON and a non-existent endpoint would look functional.
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Endpoint not found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    try {
      // Try serveStatic first, and fall back to the alternative static server if it fails
      // This lets the application work in production even without Vite
      serveStatic(app);
    } catch (error) {
      console.error("Failed to serve static files:", error);
      // Basic fallback in case both methods fail
      app.use("*", (_req, res) => {
        res.status(500).send("Server configuration error. Contact administrator.");
      });
    }
  }

  // Serves both the API and the client on a single port.
  // PORT is provided by the hosting platform (Azure App Service uses 8080);
  // 5000 is the local development default.
  const port = Number(process.env.PORT) || 5000;
  const host = process.env.HOST || "0.0.0.0";
  server.listen({ port, host }, () => {
    log(`serving on http://${host}:${port}`);
  });
})();

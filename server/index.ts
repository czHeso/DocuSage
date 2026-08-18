import { CONVERSATIONAL_ASSISTANT_PROMPT, SIMPLE_ASSISTANT_PROMPT } from './prompts';
import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic, log } from "./static";
import cors from "cors";
import { Router } from "express";
import { nanoid } from "nanoid";
import { storage } from "./storage";
import path from "path";
import { embedChatRateLimit, leadRateLimit } from "./rateLimit";

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

// NOTE: a storage.getProjects() call used to run here, at module scope, purely to
// warn about projects without an embed token. It fired on every start before the
// server was even listening, and on a cold database it only logged an error. The
// check told nobody anything actionable – embed tokens are generated when a
// project is created – so it is gone rather than moved.
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
chatEmbedRouter.post('/', embedChatRateLimit, async (req: Request, res: Response) => {
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
      // The session id is what lets the processor load the recent turns – without
      // it the widget's chatbot answers every message as if it were the first.
      const result = await DocumentProcessor.findRelevantChunksAndRespond(
        message,
        project.id,
        undefined,
        parseInt(chatSessionId.toString()),
      );
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
    
    // Offer the contact form only when the project asked for it and this
    // particular answer failed. The widget renders whatever is here and decides
    // nothing itself - which failure phrases count is a server-side question,
    // and an old cached widget would never learn a new one.
    // isUnhelpfulAnswer rather than isFailedResponse: the latter only knows
    // phrases a model writes, and misses the application's own fallbacks -
    // which is exactly when a visitor most needs somewhere to leave a question.
    const { isUnhelpfulAnswer } = await import('./services/failureDetection');
    const leadCapture =
      project.leadCaptureEnabled && isUnhelpfulAnswer(aiResponse)
        ? {
            prompt: project.leadPromptMessage,
            thankYou: project.leadThankYouMessage,
          }
        : undefined;

    // API response
    return res.json({
      message: botMessage,
      sessionId: chatSessionId,
      leadCapture,
    });
  } catch (error: any) {
    console.error("Error in embedded chat processing:", error);
    return res.status(500).json({
      message: "Error processing the chat: " + error.message,
    });
  }
});

// OPTIONS for the lead endpoint - a POST with a JSON body is preflighted
chatEmbedRouter.options('/lead', (req: Request, res: Response) => {
  setCorsHeaders(req, res);
  return res.status(204).end();
});

/**
 * Receives the contact details a visitor left after an unanswered question.
 *
 * Public, like the rest of this router, and authenticated only by the project
 * token. So: rate limited hard, validated through the shared insert schema, and
 * it stores the lead before trying to email anybody. A missing or broken SMTP
 * server must lose the notification, never the lead.
 */
chatEmbedRouter.post('/lead', leadRateLimit, async (req: Request, res: Response) => {
  setCorsHeaders(req, res);

  try {
    const { token, sessionId, name, email, message, question, pageUrl } = req.body ?? {};

    if (!token) {
      return res.status(400).json({ message: "Missing token" });
    }

    const project = await storage.getProjectByToken(token);

    if (!project) {
      return res.status(404).json({ message: "Invalid embed token" });
    }

    if (!project.leadCaptureEnabled) {
      // Not an error the visitor can do anything about, but it should not
      // silently accept data the project said it did not want.
      return res.status(403).json({ message: "This chatbot does not collect contact details." });
    }

    const { insertLeadSchema } = await import('@shared/schema');

    const parsed = insertLeadSchema.safeParse({
      projectId: project.id,
      sessionId: sessionId ? parseInt(sessionId.toString(), 10) || null : null,
      name: name || null,
      email,
      message: message || null,
      unansweredQuestion: question || null,
      pageUrl: pageUrl || null,
    });

    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message || "The contact details are not valid.",
      });
    }

    const lead = await storage.createLead(parsed.data);

    // Emailing happens after the lead is safely stored, and its failure is not
    // reported to the visitor - from their side the form worked, because it did.
    (async () => {
      try {
        const recipient = project.leadNotificationEmail || (await storage.getUser(project.ownerId))?.email;

        if (!recipient) {
          console.warn(`Lead ${lead.id} stored but there is nobody to notify.`);
          return;
        }

        const { sendLeadNotificationEmail } = await import('./mailer');
        const sent = await sendLeadNotificationEmail(recipient, {
          projectName: project.name,
          projectId: project.id,
          email: lead.email,
          name: lead.name,
          message: lead.message,
          unansweredQuestion: lead.unansweredQuestion,
          pageUrl: lead.pageUrl,
        });

        if (sent) await storage.markLeadNotified(lead.id);
      } catch (notifyError) {
        console.error('Lead stored but the notification failed:', notifyError);
      }
    })();

    return res.status(201).json({
      message: project.leadThankYouMessage || "Thank you, we will be in touch.",
    });
  } catch (error: any) {
    console.error('Error storing a lead:', error);
    return res.status(500).json({ message: "The contact details could not be saved." });
  }
});

// Rating API endpoint for embed widgets
chatEmbedRouter.post('/rating', embedChatRateLimit, async (req, res) => {
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

// Request logging. Registered before the routers below, not after: while it sat
// underneath them, nothing that the embed widget or the public API did ever
// appeared in the log – exactly the traffic an operator most wants to see.
app.use(requestLogger);

// Register the chat embed router with its own CORS settings after the main CORS
app.use('/api/chat-embed', chatEmbedRouter);

// NOTE: an apiRoutes router used to be registered here, exposing
// /api/verify-openai-key, /api/generate-response and /api/generate-embedding
// with no authentication at all – and before setupAuth() had even installed the
// session middleware, so they could not have checked a user if they wanted to.
// The last two had no caller anywhere and turned the server into an open relay
// to api.openai.com with an arbitrary prompt. The first shadowed the
// requireAuth-protected version in routes.ts, which now serves it.

// NOTE: /api/p/:id/info and /api/p/:id/chat used to be served here by a second,
// unauthenticated router registered before setupApiRoutes(). Express matches in
// registration order, so that copy won every request and the API-key check in
// routes.ts was never reached – anyone who guessed a project id (they are
// sequential) could read the project and spend the owner's AI credit. The
// duplicate is gone; those paths are now served only by the authenticated
// router that setupApiRoutes() mounts below.

// Logs one line per /api request: method, path, status, duration and the JSON
// body. Defined here and registered above, before the routers.
function requestLogger(req: Request, res: Response, next: NextFunction) {
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

      // Session IDs and the signed session cookie are credentials: anyone who
      // can read the logs could paste one back and be logged in as that user.
      // They are printed only when diagnostics are explicitly switched on, the
      // same rule auth.ts applies. This used to run unconditionally, so every
      // production log contained a working session cookie for every request.
      if (AUTH_DEBUG_ENABLED) {
        if (req.sessionID) {
          log(`Session ID: ${req.sessionID}`);
        }
        if (req.headers.cookie) {
          log(`Cookies: ${req.headers.cookie}`);
        }
      }
    }
  });

  next();
}

// Importujeme setup pro autentizaci
import { setupAuth, AUTH_DEBUG_ENABLED } from "./auth";

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
    // Loaded dynamically so the production bundle never resolves `vite`,
    // which is a devDependency – see the note in server/static.ts.
    const { setupVite } = await import("./vite");
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

  // The error handler must be registered LAST. Express only routes an error to
  // handlers that come after the middleware that raised it, so while this sat
  // above the 404 and the Vite/static layers it never saw their errors – a
  // failure inside vite.transformIndexHtml() fell through to Express's built-in
  // handler, which replies with an HTML stack trace in development.
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

  // Serves both the API and the client on a single port.
  // PORT is provided by the hosting platform (Azure App Service uses 8080);
  // 5000 is the local development default.
  const port = Number(process.env.PORT) || 5000;
  const host = process.env.HOST || "0.0.0.0";
  server.listen({ port, host }, () => {
    log(`serving on http://${host}:${port}`);
  });
})();

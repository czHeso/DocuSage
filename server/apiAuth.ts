import { Request, Response, NextFunction } from 'express';
import { eq, and, gte } from 'drizzle-orm';
import { db } from './db';
import { projects, apiCalls } from '@shared/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Verifies the API key in the request header
 * The key must be supplied in the 'X-API-Key' header
 */
export const verifyApiKey = async (req: Request, res: Response, next: NextFunction) => {
  // Read the API key from the header
  const apiKey = req.header('X-API-Key');
  
  // If the API key is not in the header, return an error
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Missing API key. Use the X-API-Key header to authenticate.'
    });
  }

  try {
    // Look up the project by API key
    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.apiKey, apiKey));

    // If the project does not exist or has the API disabled, return an error
    if (!project) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key.'
      });
    }

    if (!project.apiEnabled) {
      return res.status(403).json({
        success: false,
        error: 'API je pro tento projekt vypnuto.'
      });
    }

    // Store the project on the req object for later use
    req.project = project;
    
    // Rate limit check - number of calls per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    // NOTE: `conditionA && conditionB` does not work here – JavaScript returns only
    // the second operand, so only the date would be filtered and the limit would be
    // counted across all projects together. and() must be used.
    const apiCallCount = await db.select({ count: sql`count(*)` })
      .from(apiCalls)
      .where(
        and(
          eq(apiCalls.projectId, project.id),
          gte(apiCalls.createdAt, todayStart)
        )
      );
      
    const count = Number(apiCallCount[0]?.count || 0);
    
    if (count >= (project.apiRateLimit || 100)) {
      return res.status(429).json({
        success: false,
        error: `Daily API call limit exceeded (${project.apiRateLimit || 100}). Please try again tomorrow.`
      });
    }
    
    next();
  } catch (error) {
    console.error('Error verifying the API key:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error while verifying the API key.'
    });
  }
};

/**
 * Logs an API call to the database
 * Measures response time and records request and response details
 */
export const logApiCall = async (
  req: Request, 
  res: Response, 
  statusCode: number, 
  responseData: any, 
  error: string | null = null,
  responseTime: number
) => {
  try {
    if (!req.project) {
      console.error('The project is not available on the req object');
      return;
    }
    
    // Strip credentials from the headers before they reach the database.
    // x-api-key is the one this API authenticates with, and the call history is
    // readable through GET /api/projects/:id/api/calls – leaving it in stored the
    // key in plain text and handed it to anyone who could read that history.
    const safeHeaders = { ...req.headers };
    for (const header of ['authorization', 'cookie', 'x-api-key', 'x-api-token', 'proxy-authorization']) {
      delete safeHeaders[header];
    }
    
    // Filter out potentially large chunks of data before storing
    const safeRequestData = {
      params: req.params,
      query: req.query,
      body: req.body,
      headers: safeHeaders,
      // Limit storing large chunks of data if necessary
    };
    
    // Write the API call record
    await db.insert(apiCalls).values({
      projectId: req.project.id,
      endpoint: req.path,
      method: req.method,
      requestData: safeRequestData,
      responseData: responseData,
      statusCode: statusCode,
      responseTime: responseTime,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
      success: !error,
      errorMessage: error,
    });
  } catch (logError) {
    console.error('Error logging the API call:', logError);
  }
};

/**
 * Middleware for logging API calls
 * Measures response time and records request and response details
 */
export const apiCallLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  let capturedBody: any = undefined;

  // res.json and res.send are overridden only to remember the body. They must not
  // write the log themselves: Express implements res.json in terms of res.send, so
  // logging in both wrote every JSON response to api_calls twice — and three times
  // for a 4xx, because the old res.on('finish') handler logged errors again.
  // Since the daily rate limit counts rows in that table, a project reached its
  // limit at half (or a third) of the calls it was supposed to get.
  const originalJson = res.json;
  res.json = function (body: any) {
    capturedBody = body;
    return originalJson.call(this, body);
  };

  const originalSend = res.send;
  res.send = function (body: any) {
    if (capturedBody === undefined) capturedBody = body;
    return originalSend.call(this, body);
  };

  // Exactly one record per request, written once the response is complete.
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    logApiCall(
      req,
      res,
      res.statusCode,
      capturedBody ?? null,
      isError ? `HTTP ${res.statusCode}` : null,
      responseTime,
    );
  });

  next();
};

/**
 * Generates a new API key
 * @returns The generated API key
 */
export function generateApiKey(): string {
  // Creates 32 bytes of random data and converts them into a hex string
  return crypto.randomBytes(32).toString('hex');
}

// Express type extensions for our middleware
declare global {
  namespace Express {
    interface Request {
      project?: import('@shared/schema').Project;
      /** Set by checkChatSessionAccess for routes whose `:id` is a chat session. */
      chatSession?: import('@shared/schema').ChatSession;
    }
  }
}
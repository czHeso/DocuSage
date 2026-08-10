import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { hashPassword, comparePasswords } from "./password";
import { storage } from "./storage";
import { User as SelectUser, users } from "@shared/schema";
import { sendActivationEmail, sendPasswordResetEmail, sendResendActivationEmail } from "./mailer";
// No node-fetch import: Node 18+ ships fetch as a global, and this project
// requires Node 20. The dependency existed only for this one call.
import { nanoid } from "nanoid";
import { db } from "./db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

declare module "passport-local" {
  /**
   * Extra machine-readable flags passed from the strategy to the route,
   * so the route never has to parse the human-readable message.
   */
  interface IVerifyOptions {
    /** The credentials were correct, but the account is not activated yet. */
    inactive?: boolean;
  }
}

/** Minimum password length for registration and password changes. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Allow anyone to create an account. Defaults to `false` – a self-hosted instance
 * is usually private. The very first account in an empty database is always allowed (and becomes admin).
 */
export const ALLOW_PUBLIC_REGISTRATION =
  process.env.ALLOW_PUBLIC_REGISTRATION === 'true';

/**
 * Optional restriction of registration to specific email domains,
 * e.g. ALLOWED_EMAIL_DOMAINS="company.com,example.com".
 * An empty value means no restriction.
 */
export const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

export function isEmailDomainAllowed(email: string): boolean {
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  const domain = email.toLowerCase().split('@')[1];
  return Boolean(domain) && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

/** Strips sensitive fields from a user so they never reach an API response. */
export function toPublicUser(user: SelectUser) {
  const { password, activationToken, resetPasswordToken, resetPasswordExpires, ...publicUser } = user;
  return publicUser;
}

// Hashing lives in ./password so that storage.ts can use it without importing
// this module, which imports storage.ts in turn. Re-exported here because
// callers have always reached for it through auth.
export { hashPassword, comparePasswords };

/**
 * Session debug output.
 *
 * It prints the session ID and cookies – anyone with access to the logs could use
 * them to impersonate a logged-in user. It is therefore active only outside production,
 * or when explicitly enabled via DEBUG_AUTH=true.
 */
export const AUTH_DEBUG_ENABLED =
  process.env.DEBUG_AUTH === 'true' || process.env.NODE_ENV !== 'production';

function authDebug(...args: unknown[]) {
  if (AUTH_DEBUG_ENABLED) {
    console.log(...args);
  }
}

export const debugSessionMiddleware = (req: any, res: any, next: any) => {
  if (!AUTH_DEBUG_ENABLED) return next();

  console.log('--- SESSION DEBUG ---');
  console.log('Session ID:', req.sessionID);
  console.log('Is Authenticated:', req.isAuthenticated());
  console.log('User:', req.user ? `ID: ${req.user.id}, Username: ${req.user.username}` : 'None');
  console.log('Session Data:', req.session);
  console.log('Cookies:', req.headers.cookie);
  console.log('--- END SESSION DEBUG ---');
  next();
};

/**
 * Simple protection against password guessing – counts failed attempts per
 * IP address within a sliding window and blocks temporarily once the limit is hit.
 *
 * NOTE: state lives in process memory. When running multiple instances (e.g. a scaled
 * App Service), also protect login at the reverse proxy or WAF level.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 10);
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

function attemptKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const key = attemptKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (entry && now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
  } else if (entry && entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAttempt)) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      message: `Too many failed attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`
    });
  }

  next();
}

/** Records a failed login attempt. */
export function recordFailedLogin(req: Request) {
  const key = attemptKey(req);
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    entry.count += 1;
  }
}

/** Resets the counter after a successful login. */
export function clearFailedLogins(req: Request) {
  loginAttempts.delete(attemptKey(req));
}

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!process.env.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is not set. Generate a long random string and put it in .env - session cookies cannot be signed securely without it.'
    );
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false, // Don't force session save if not modified
    saveUninitialized: false, // Don't save uninitialized sessions
    cookie: {
      // In production the cookie is sent over HTTPS only.
      // When running behind a reverse proxy, it must forward X-Forwarded-Proto.
      secure: isProduction,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'lax', // Helps with CSRF protection
      path: '/'
    },
    store: storage.sessionStore,
    name: 'docusage.sid' // Custom name to avoid using the default (connect.sid)
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        authDebug("[DEBUG] Login attempt:", username);
        
        // First try to find the user by username
        let user = await storage.getUserByUsername(username);
        
        // If not found by username, try the email
        if (!user) {
          authDebug("[DEBUG] User not found by username, trying email");
          user = await storage.getUserByEmail(username);
        }
        
        // Log debug info
        if (user) {
          authDebug("[DEBUG] User found:", user.username, "ID:", user.id);
          authDebug("[DEBUG] Comparing passwords...");
          const passwordMatch = await comparePasswords(password, user.password);
          authDebug("[DEBUG] Password match:", passwordMatch);
          
          if (!passwordMatch) {
            authDebug("[DEBUG] Password verification failed");
            return done(null, false);
          }
        } else {
          authDebug("[DEBUG] User not found");
          return done(null, false);
        }
        
        // Verify that the account is activated (when the activation system is in use)
        if (user.isActive === false) {
          authDebug("[DEBUG] Account is not active - rejecting login");
          // `inactive` is a machine-readable flag; the route must not have to
          // parse the human-readable message to recognise this case.
          return done(null, false, {
            inactive: true,
            message: "The account is not activated. Check your email and click the activation link."
          });
        }
        
        // Update the last login time
        await storage.updateUserLastLogin(user.id);
        
        return done(null, user);
      } catch(err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    authDebug("Serializing user:", user.id, user.username);
    return done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      authDebug("Deserializing user ID:", id);
      const user = await storage.getUser(id);
      if (!user) {
        console.log("User not found during deserialization for ID:", id);
        return done(null, false);
      }
      authDebug("User deserialized successfully:", user.id, user.username);
      return done(null, user);
    } catch (err) {
      console.error("Error during user deserialization:", err);
      return done(err);
    }
  });

  // Function for verifying the CAPTCHA token
  async function verifyCaptcha(token: string): Promise<boolean> {
    if (!process.env.CAPTCHA_SECRET_KEY) {
      console.warn('CAPTCHA secret key not configured. Bypassing CAPTCHA verification.');
      return true; // Without a key we skip verification
    }
    
    try {
      // URLSearchParams rather than string interpolation: a token containing
      // & or = would otherwise change the shape of the form body.
      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: process.env.CAPTCHA_SECRET_KEY,
          response: token,
        }).toString(),
      });

      const data = (await response.json()) as { success?: boolean };
      return data.success === true;
    } catch (error) {
      console.error('Error verifying CAPTCHA:', error);
      return false;
    }
  }

  /**
   * Public information about how the instance is configured.
   * The login page uses this to show (or hide) the registration form.
   * Deliberately returns nothing sensitive.
   */
  app.get("/api/auth/config", async (_req, res) => {
    try {
      const isFirstUser = (await storage.getAllUsers()).length === 0;

      return res.json({
        // Registration is possible when it is enabled – or when the instance has
        // no account yet (that is when the first administrator is created).
        registrationEnabled: ALLOW_PUBLIC_REGISTRATION || isFirstUser,
        // true = the registrant becomes an administrator
        firstUserSetup: isFirstUser,
        allowedEmailDomains: ALLOWED_EMAIL_DOMAINS,
        minPasswordLength: MIN_PASSWORD_LENGTH,
      });
    } catch (err) {
      console.error("Error reading auth config:", err);
      return res.status(500).json({ message: "Chyba serveru" });
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // The very first account in an empty instance may always be created and becomes an
      // administrator – otherwise the instance could not be set up at all.
      const isFirstUser = (await storage.getAllUsers()).length === 0;

      if (!isFirstUser && !ALLOW_PUBLIC_REGISTRATION) {
        return res.status(403).json({
          message: "Public registration is disabled on this instance. Ask an administrator to create an account for you.",
          registrationDisabled: true
        });
      }

      // Validate input
      if (!req.body.username || !req.body.password || !req.body.email) {
        return res.status(400).json({ message: "Missing registration data" });
      }

      if (typeof req.body.password !== 'string' || req.body.password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `The password must be at least ${MIN_PASSWORD_LENGTH} characters long` });
      }

      // Verify that the email has a valid shape (basic check)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }

      // Optional restriction to allowed email domains
      if (!isEmailDomainAllowed(req.body.email)) {
        return res.status(400).json({
          message: `Registration is only allowed for these domains: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`
        });
      }

      // CAPTCHA verification
      if (req.body.captchaToken) {
        const isValidCaptcha = await verifyCaptcha(req.body.captchaToken);
        if (!isValidCaptcha) {
          return res.status(400).json({ message: "CAPTCHA verification failed" });
        }
      } else {
        // If CAPTCHA is mandatory, check that a token was supplied
        if (process.env.CAPTCHA_REQUIRED === 'true') {
          return res.status(400).json({ message: "CAPTCHA verification is required" });
        }
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "That username already exists" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ message: "That email already exists" });
      }
      
      // Generate an activation token for email verification
      const activationToken = nanoid(32);

      // The first account in the instance is an immediately active administrator, so the
      // instance can be set up even without SMTP configured.
      const requireVerification = !isFirstUser;

      // Fields are listed explicitly – spreading req.body would let the client
      // smuggle in any column (e.g. role or isActive).
      const user = await storage.createUser({
        username: req.body.username,
        email: req.body.email,
        // Plain text on purpose – storage.createUser hashes it. Hashing here as
        // well would store hash(hash(password)) and no login could ever succeed.
        password: req.body.password,
        role: isFirstUser ? 'admin' : 'user',
        isActive: isFirstUser,
        activationToken: isFirstUser ? null : activationToken,
      });

      if (isFirstUser) {
        console.log(`[auth] First account "${user.username}" created – assigned the admin role.`);
        return req.login(user, (err) => {
          if (err) return next(err);
          return res.status(201).json({
            ...toPublicUser(user),
            verificationRequired: false,
            message: "Registration successful. As the first account, you have been given the administrator role."
          });
        });
      }
      
      // Send the activation email only when verification is required
      let emailSent = false;
      if (requireVerification) {
        try {
          // Attempt to send the activation email
          emailSent = await sendActivationEmail(user, activationToken);
          
          if (!emailSent) {
            console.warn(`The activation email was not sent for user: ${user.username}, ID: ${user.id}`);
            
            // If we are in production, or in dev with email delivery problems:
            // 1. Leave the user created but not activated
            // 2. Return a specific error message with the activation token for the administrator
            
            // In production we would never send the activation token in the response,
            // but with email problems it is a fallback for administrators
            
            // Allow login without activation in dev, or when debug mode is enabled
            if (process.env.NODE_ENV === 'development' || process.env.DEBUG_AUTH === 'true') {
              // In dev, activate the account automatically
              await storage.activateUser(activationToken);
              
              return res.status(201).json({
                id: user.id,
                username: user.username,
                email: user.email,
                verificationRequired: false,
                message: "Registration successful. Email activation was skipped in the development environment.",
                manualActivation: true
              });
            } else {
              // In production, report the problem but keep the account created
              return res.status(201).json({
                id: user.id,
                username: user.username,
                email: user.email,
                verificationRequired: true,
                message: "Registration succeeded, but the activation email could not be sent. Please contact an administrator.",
                emailFailed: true  // Flag for the frontend
              });
            }
          }
        } catch (emailError) {
          console.error("Error sending the activation email:", emailError);
          
          // Same procedure as for !emailSent, but with a more detailed error for logging
          if (process.env.NODE_ENV === 'development' || process.env.DEBUG_AUTH === 'true') {
            await storage.activateUser(activationToken);
            
            return res.status(201).json({
              id: user.id,
              username: user.username,
              email: user.email,
              verificationRequired: false,
              message: "Registration successful. Email activation was skipped in the development environment.",
              manualActivation: true
            });
          } else {
            return res.status(201).json({
              id: user.id,
              username: user.username,
              email: user.email,
              verificationRequired: true,
              message: "Registration succeeded, but the activation email could not be sent. Please contact an administrator.",
              emailFailed: true
            });
          }
        }
      }
      
      // Log the user in only when email verification is not required
      if (!requireVerification) {
        req.login(user, (err) => {
          if (err) return next(err);
          return res.status(201).json({
            ...toPublicUser(user),
            verificationRequired: false,
            message: "Registration successful."
          });
        });
      } else {
        // Otherwise just confirm the registration and note that the email must be verified
        return res.status(201).json({
          id: user.id,
          username: user.username,
          email: user.email,
          verificationRequired: true,
          message: "Registration successful. Check your email to activate the account."
        });
      }
    } catch (err) {
      console.error("Error in registration:", err);
      return res.status(500).json({ message: "Server error during registration" });
    }
  });

  app.post("/api/login", loginRateLimiter, (req, res, next) => {
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ message: "Missing login credentials" });
    }

    authDebug("Login attempt for user:", req.body.username);

    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) {
        console.error("Login error:", err);
        return next(err);
      }

      if (!user) {
        recordFailedLogin(req);
        authDebug("Authentication failed:", info?.message || "Invalid credentials");

        // If we have a specific message about an inactive account, show it
        if (info?.inactive) {
          return res.status(401).json({
            message: info.message,
            inactive: true // Add a flag marking the account as not activated
          });
        }
        return res.status(401).json({ message: "Invalid login credentials" });
      }

      req.login(user, (err) => {
        if (err) {
          console.error("Session save error:", err);
          return next(err);
        }

        clearFailedLogins(req);

        // To prevent session fixation, replace the session ID with a new one after login.
        req.session.regenerate((regenerateErr) => {
          if (regenerateErr) {
            console.error("Session regenerate error:", regenerateErr);
            return next(regenerateErr);
          }

          // regenerate() creates an empty session, so the user must be logged in again
          req.login(user, (loginErr) => {
            if (loginErr) {
              console.error("Re-login after regenerate failed:", loginErr);
              return next(loginErr);
            }

            req.session.save((saveErr) => {
              if (saveErr) {
                console.error("Session explicit save error:", saveErr);
                return next(saveErr);
              }

              authDebug("User logged in successfully:", user.username);
              return res.status(200).json(toPublicUser(user));
            });
          });
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  // Endpoint for account activation using a token in the URL
  app.get("/api/activate-account", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid activation token" 
        });
      }
      
      // Account activation via token
      const activatedUser = await storage.activateUser(token);
      
      if (!activatedUser) {
        return res.status(404).json({ 
          success: false, 
          message: "Invalid activation token, or the account has already been activated" 
        });
      }
      
      return res.status(200).json({ 
        success: true, 
        message: "Your account has been activated. You can now log in." 
      });
    } catch (error) {
      console.error("Error activating the account:", error);
      return res.status(500).json({ 
        success: false, 
        message: "An error occurred while activating the account. Please try again later." 
      });
    }
  });

  app.get("/api/user", (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "User is not logged in" });
      }
      
      authDebug("User authenticated:", req.user.username);
      return res.status(200).json(toPublicUser(req.user));
    } catch (err) {
      console.error("Error fetching user:", err);
      return res.status(500).json({ message: "Server error while retrieving user data" });
    }
  });
  
  // Endpoint for resending the activation email
  app.post("/api/resend-activation", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ 
          success: false, 
          message: "The email parameter is required" 
        });
      }
      
      // Check that the email has a valid format
      if (!email.includes('@') || !email.includes('.')) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address"
        });
      }
      
      // Generate a new activation token and fetch the user
      const result = await storage.generateActivationToken(email);
      
      if (!result) {
        // For security reasons we return the same response
        // even when the user does not exist, to thwart enumeration attacks
        return res.status(200).json({ 
          success: true, 
          message: "If the account exists and is not activated, a new activation email has been sent" 
        });
      }
      
      const { user, token } = result;
      
      // Check whether the user is already activated (the token is an empty string in that case)
      if (user.isActive || !token) {
        return res.status(200).json({ 
          success: true, 
          message: "The account is already activated. You can log in." 
        });
      }
      
      // Send the activation email using our new function
      const { sendResendActivationEmail } = await import('./mailer');
      const emailSent = await sendResendActivationEmail(user, token);
      
      if (emailSent) {
        return res.status(200).json({ 
          success: true, 
          message: "The activation email has been sent. Check your inbox." 
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          message: "Sending the activation email failed. Please try again later." 
        });
      }
    } catch (error) {
      console.error("Error sending the activation email:", error);
      return res.status(500).json({ 
        success: false, 
        message: "An error occurred while sending the activation email. Please try again later." 
      });
    }
  });
  
  // Account activation via token
  app.get("/api/activate/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ message: "Missing activation token" });
      }
      
      const user = await storage.activateUser(token);
      
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired activation token" });
      }
      
      // Log the user in after activation
      req.login(user, (err) => {
        if (err) {
          console.error("Error logging in after activation:", err);
          return res.status(500).json({ message: "Activation succeeded, but the login failed" });
        }
        
        return res.status(200).json({
          message: "The account has been activated",
          user
        });
      });
    } catch (err) {
      console.error("Error during account activation:", err);
      return res.status(500).json({ message: "Server error while activating the account" });
    }
  });
  
  // Request a password reset
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Missing email" });
      }
      
      // Vygenerujeme token pro reset hesla
      const result = await storage.generateResetToken(email);
      
      // Even though no user was found, we do not reveal that, for security reasons
      if (!result) {
        return res.status(200).json({ 
          message: "If this email address is registered, a password reset link has been sent to it" 
        });
      }
      
      // Send the email with the password reset link
      const emailSent = await sendPasswordResetEmail(result.user, result.token);
      
      return res.status(200).json({ 
        message: "If this email address is registered, a password reset link has been sent to it" 
      });
    } catch (err) {
      console.error("Error requesting password reset:", err);
      return res.status(500).json({ message: "Server error while processing the password reset request" });
    }
  });
  
  // Password reset via token
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Missing token or new password" });
      }
      
      // Verify that the password is long enough
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "The password must be at least 6 characters long" });
      }
      
      // Provedeme reset hesla
      const success = await storage.resetPassword(token, newPassword);
      
      if (!success) {
        return res.status(400).json({ message: "Invalid or expired password reset token" });
      }
      
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("Error resetting password:", err);
      return res.status(500).json({ message: "Server error while resetting the password" });
    }
  });
  
  // Password change for the logged-in user
  app.post("/api/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "User is not logged in" });
      }
      
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Missing current or new password" });
      }
      
      // Verify the existing password
      const user = await storage.getUser(req.user.id);
      if (!user || !(await comparePasswords(currentPassword, user.password))) {
        return res.status(400).json({ message: "The current password is incorrect" });
      }
      
      // Verify that the new password is long enough
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "The new password must be at least 6 characters long" });
      }
      
      // Change the password
      const success = await storage.changeUserPassword(req.user.id, newPassword);
      
      if (!success) {
        return res.status(500).json({ message: "The password could not be changed" });
      }
      
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("Error changing password:", err);
      return res.status(500).json({ message: "Server error while changing the password" });
    }
  });
  
  // Get the list of all users (admins only)
  app.get("/api/admin/users", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "User is not logged in" });
      }
      
      // Check whether the user is an admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to access the user list" });
      }
      
      const users = await storage.getAllUsers();
      
      return res.status(200).json(users.map(toPublicUser));
    } catch (err) {
      console.error("Error fetching users:", err);
      return res.status(500).json({ message: "Server error while retrieving the user list" });
    }
  });
  
  // Change a user's role (admins only)
  app.patch("/api/admin/users/:id/role", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "User is not logged in" });
      }
      
      // Check whether the user is an admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to change a user's role" });
      }
      
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      
      if (!role || !['user', 'vip', 'unlimited', 'admin'].includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      // Role change
      const updatedUser = await storage.updateUserRole(userId, role as any);
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json(updatedUser);
    } catch (err) {
      console.error("Error updating user role:", err);
      return res.status(500).json({ message: "Server error while changing the user's role" });
    }
  });
  
  // Delete the user
  app.delete("/api/users/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "User is not logged in" });
      }
      
      const userId = parseInt(req.params.id);
      
      // A user may delete only their own account unless they are an admin
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: "Insufficient permissions to delete this user" });
      }
      
      // Delete the user
      const success = await storage.deleteUser(userId);
      
      if (!success) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // If the user deleted their own account, log them out
      if (req.user.id === userId) {
        req.logout((err) => {
          if (err) {
            console.error("Error logging out after account deletion:", err);
          }
          
          return res.status(200).json({ message: "User deleted successfully" });
        });
      } else {
        return res.status(200).json({ message: "User deleted successfully" });
      }
    } catch (err) {
      console.error("Error deleting user:", err);
      return res.status(500).json({ message: "Server error while deleting the user" });
    }
  });
  
  // Dark/light mode setting
  app.patch("/api/user/darkmode", async (req, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ message: "User is not logged in" });
      }
      
      const { darkMode } = req.body;
      
      if (typeof darkMode !== 'boolean') {
        return res.status(400).json({ message: "Invalid value for darkMode" });
      }
      
      // Update settings
      const [updatedUser] = await db
        .update(users)
        .set({ darkMode })
        .where(eq(users.id, req.user.id))
        .returning();
      
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json(updatedUser);
    } catch (err) {
      console.error("Error updating dark mode setting:", err);
      return res.status(500).json({ message: "Server error while updating the settings" });
    }
  });
}

// Middleware pro kontrolu autentizace
export function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ 
      success: false, 
      message: "User is not logged in" 
    });
  }
  next();
}

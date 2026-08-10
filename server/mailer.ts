import nodemailer from 'nodemailer';
import type { User } from '@shared/schema';

// Konfigurace SMTP transportu
let transporter: nodemailer.Transporter | null = null;

// Inicializace nodemailer
try {
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    // Correct SMTP_SECURE if it is set incorrectly
    let smtpSecure = process.env.SMTP_SECURE;
    if (smtpSecure !== 'true' && smtpSecure !== 'false') {
      console.warn(`SMTP_SECURE has an invalid value: ${smtpSecure}, defaulting to 'false'`);
      process.env.SMTP_SECURE = 'false';
      smtpSecure = 'false';
    }
    
    console.log(`Initializing SMTP with host: ${process.env.SMTP_HOST}, port: ${process.env.SMTP_PORT}, secure: ${smtpSecure === 'true'}`);
    console.log(`SMTP user: ${process.env.SMTP_USER ? '(set)' : '(not set)'}, password: ${process.env.SMTP_PASSWORD ? '(set)' : '(not set)'}`);
    console.log(`Email from: ${process.env.EMAIL_FROM || '(not set)'}`);
    
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: smtpSecure === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
      // Enable debug mode for more information
      debug: true,
      logger: true
    });
    
    console.log('SMTP transporter initialized successfully');
    
    // Verify that the connection to the SMTP server works
    transporter.verify(function(error, success) {
      if (error) {
        console.error('SMTP verification failed:', error);
        // Set the transporter to null if verification fails
        transporter = null;
      } else {
        console.log('SMTP server is ready to take our messages');
      }
    });
  } else {
    console.warn('SMTP configuration not found. Email functionality will not work.');
    console.warn('Missing: ' + 
      (!process.env.SMTP_HOST ? 'SMTP_HOST ' : '') + 
      (!process.env.SMTP_PORT ? 'SMTP_PORT ' : '') + 
      (!process.env.SMTP_USER ? 'SMTP_USER ' : '') + 
      (!process.env.SMTP_PASSWORD ? 'SMTP_PASSWORD ' : '') + 
      (!process.env.EMAIL_FROM ? 'EMAIL_FROM ' : ''));
  }
} catch (error) {
  console.error('Error initializing SMTP transporter:', error);
  transporter = null;
}

// Helper for checking whether the email service is available
function isMailServiceAvailable(): boolean {
  return transporter !== null;
}

// Types of emails we can send
type EmailType = 'activation' | 'resetPassword' | 'projectInvitation' | 'resendActivation';

/**
 * Verifies that the email address is valid and not a test address
 * @param email Email address to verify
 * @returns True if the address is valid, otherwise false
 */
function isValidEmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Basic email validation
  if (!email.includes('@') || !email.includes('.')) {
    console.warn(`Invalid email format: ${email}`);
    return false;
  }
  
  // Check for test email addresses
  if (email.includes('example.com') || email.includes('test@')) {
    console.warn(`Detected a test email address: ${email}, the email will not be sent`);
    return false;
  }
  
  return true;
}

// Function for sending the activation email
export async function sendActivationEmail(user: User, activationToken: string): Promise<boolean> {
  if (!isMailServiceAvailable()) {
    console.warn('Mail service not available. Cannot send activation email.');
    return false;
  }
  
  // Validate the email address
  if (!isValidEmailAddress(user.email)) {
    console.error(`Attempted to send an activation email to an invalid address: ${user.email}`);
    return false;
  }

  const activationUrl = `${process.env.APP_URL || 'https://docusage.cz'}/activate?token=${activationToken}`;
  
  try {
    const info = await transporter!.sendMail({
      from: process.env.EMAIL_FROM || '"DocuSage" <noreply@docusage.cz>',
      to: user.email,
      subject: 'Activate your DocuSage account',
      text: `Welcome to DocuSage!\n\nTo activate your account, click the following link: ${activationUrl}\n\nIf you did not create a DocuSage account, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Welcome to DocuSage!</h2>
          <p>Thank you for registering. Please click the button below to activate your account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${activationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Activate account</a>
          </div>
          <p>If the button does not work, copy and paste the following link into your browser:</p>
          <p style="word-break: break-all;">${activationUrl}</p>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">If you did not create a DocuSage account, you can ignore this email.</p>
        </div>
      `,
    });
    
    console.log('Activation email sent successfully to:', user.email, 'Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending activation email:', error);
    return false;
  }
}

// Function for sending the password reset email
export async function sendPasswordResetEmail(user: User, resetToken: string): Promise<boolean> {
  if (!isMailServiceAvailable()) {
    console.warn('Mail service not available. Cannot send password reset email.');
    return false;
  }
  
  // Validate the email address
  if (!isValidEmailAddress(user.email)) {
    console.error(`Attempted to send a password reset email to an invalid address: ${user.email}`);
    return false;
  }

  const resetUrl = `${process.env.APP_URL || 'https://docusage.cz'}/reset-password?token=${resetToken}`;
  
  try {
    const info = await transporter!.sendMail({
      from: process.env.EMAIL_FROM || '"DocuSage" <noreply@docusage.cz>',
      to: user.email,
      subject: 'Password reset DocuSage',
      text: `We received a request to reset the password for your DocuSage account.\n\nTo reset your password, click the following link: ${resetUrl}\n\nIf you did not request a password reset, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Password reset pro DocuSage</h2>
          <p>We received a request to reset the password for your account. Please click the button below to set a new one:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset password</a>
          </div>
          <p>If the button does not work, copy and paste the following link into your browser:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
          <p>The link is valid for 24 hours.</p>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">If you did not request a password reset, you can ignore this email.</p>
        </div>
      `,
    });
    
    console.log('Password reset email sent successfully to:', user.email, 'Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}

// Function for sending a project invitation
export async function sendProjectInvitationEmail(
  email: string, 
  inviterName: string, 
  projectName: string,
  projectId: number
): Promise<boolean> {
  if (!isMailServiceAvailable()) {
    console.warn('Mail service not available. Cannot send project invitation email.');
    return false;
  }
  
  // Validate the email address
  if (!isValidEmailAddress(email)) {
    console.error(`Attempted to send a project invitation to an invalid address: ${email}`);
    return false;
  }

  const invitationUrl = `${process.env.APP_URL || 'https://docusage.cz'}/projects/${projectId}`;
  
  try {
    const info = await transporter!.sendMail({
      from: process.env.EMAIL_FROM || '"DocuSage" <noreply@docusage.cz>',
      to: email,
      subject: `Invitation to collaborate on the project "${projectName}"`,
      text: `${inviterName} has invited you to collaborate on the project "${projectName}" in DocuSage.\n\nTo view the project, click the following link: ${invitationUrl}\n\nIf you do not have a DocuSage account yet, you will need to create one.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">Invitation to collaborate</h2>
          <p><strong>${inviterName}</strong> has invited you to collaborate on the project <strong>"${projectName}"</strong> in DocuSage.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View project</a>
          </div>
          <p>If the button does not work, copy and paste the following link into your browser:</p>
          <p style="word-break: break-all;">${invitationUrl}</p>
          <p>If you do not have a DocuSage account yet, you will need to create one.</p>
        </div>
      `,
    });
    
    console.log('Project invitation email sent successfully to:', email, 'Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending project invitation email:', error);
    return false;
  }
}

/**
 * Function for resending the activation email
 * @param user User or email address the new activation email should be sent to
 * @param activationToken New activation token
 * @returns Result of sending the email
 */
export async function sendResendActivationEmail(
  userOrEmail: User | string, 
  activationToken: string
): Promise<boolean> {
  if (!isMailServiceAvailable()) {
    console.warn('Mail service not available. Cannot send activation email.');
    return false;
  }

  // Get the email either directly from the parameter or from the user object
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
  
  // Validate the email address
  if (!isValidEmailAddress(email)) {
    console.error(`Attempted to resend an activation email to an invalid address: ${email}`);
    return false;
  }
  
  const activationUrl = `${process.env.APP_URL || 'https://docusage.cz'}/activate?token=${activationToken}`;
  
  try {
    const info = await transporter!.sendMail({
      from: process.env.EMAIL_FROM || '"DocuSage" <noreply@docusage.cz>',
      to: email,
      subject: 'New DocuSage activation link',
      text: `We received a request for a new activation link for your DocuSage account.\n\nTo activate your account, click the following link: ${activationUrl}\n\nIf you did not request a new activation link, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">New activation link</h2>
          <p>We received a request for a new activation link for your DocuSage account.</p>
          <p>Please click the button below to activate your account:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${activationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Activate account</a>
          </div>
          <p>If the button does not work, copy and paste the following link into your browser:</p>
          <p style="word-break: break-all;">${activationUrl}</p>
          <p style="margin-top: 30px; font-size: 12px; color: #666;">If you did not request a new activation link, you can ignore this email.</p>
        </div>
      `,
    });
    
    console.log('Resend activation email sent successfully to:', email, 'Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending resend activation email:', error);
    return false;
  }
}
import {
  users,
  projects,
  teamMembers,
  globalTeamMembers,
  pdfs,
  chatSessions,
  chatMessages,
  apiCalls,
  trainingOptions,
  processedDocuments,
  queryTopics,
  queryToTopics,
  chatbotAnalytics,
  pdfChunks,
  failedResponses,
  documentChunks,
  userActivity,
  type InsertChatSession,
} from "@shared/schema";

import { db } from "./db";
import { eq, and, inArray, sql, desc, isNotNull, or, gte, lte, not, like, lt, asc, count } from "drizzle-orm";
import { randomBytes } from "crypto";
import Session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
// From ./password, not ./auth: auth imports this module, and importing it back
// closed a cycle that only worked by accident of ESM hoisting.
import { hashPassword } from "./password";

const PostgresSessionStore = connectPg(Session);

class DatabaseStorage {
  sessionStore;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      tableName: 'session',
      createTableIfMissing: true,
      ttl: 86400 * 7, // 7 days in seconds
      pruneSessionInterval: 60 * 15, // 15 minutes
      errorLog: console.error
    });
  }

  // Users
  async getUser(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  /**
   * Creates a user. `user.password` is expected in **plain text** – it is hashed here.
   * Hashing is done in the storage layer only; a caller that hashes as well would
   * store hash(hash(password)) and the account could never log in.
   */
  async createUser(user: any) {
    // If a password was provided, hash it
    const userData = { ...user };
    if (userData.password) {
      userData.password = await hashPassword(userData.password);
    }
    
    const [createdUser] = await db.insert(users).values(userData).returning();
    return createdUser;
  }

  async updateUser(id: number, user: any) {
    const [updatedUser] = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  /**
   * Changes a user's role.
   * @returns the updated user, or undefined if the user does not exist
   */
  async updateUserRole(id: number, role: string) {
    const [updatedUser] = await db
      .update(users)
      .set({ role: role as any })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: number) {
    try {
      // First check whether the user exists
      const [user] = await db.select().from(users).where(eq(users.id, id));
      
      if (!user) {
        return false;
      }
      
      // Delete the user
      await db.delete(users).where(eq(users.id, id));
      
      return true;
    } catch (error) {
      console.error('Error deleting the user in storage:', error);
      return false;
    }
  }
  
  /**
   * Updates the user's last login time
   * @param userId ID of the user whose login time we are updating
   */
  async updateUserLastLogin(userId: number) {
    try {
      await db
        .update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, userId));
      
      console.log(`Updated the last login time for user ID: ${userId}`);
      return true;
    } catch (error) {
      console.error(`Error updating the login time for user ID: ${userId}:`, error);
      return false;
    }
  }

  async getAllUsers() {
    return await db.select().from(users).orderBy(users.username);
  }

  async getAdminUsers() {
    return await db.select().from(users).where(eq(users.role, 'admin')).orderBy(users.username);
  }

  async activateUser(token: string) {
    // Find the user with the given activation token
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.activationToken, token));
    
    if (!user) return undefined;
    
    // Mark the account as active and clear the token
    const [activatedUser] = await db
      .update(users)
      .set({ 
        isActive: true, 
        activationToken: null 
      })
      .where(eq(users.id, user.id))
      .returning();
    
    return activatedUser;
  }

  /**
   * Activates a user directly by ID (used by the admin panel), without an activation token.
   * @returns the activated user, or undefined if the user does not exist
   */
  async activateUserById(id: number) {
    const [activatedUser] = await db
      .update(users)
      .set({
        isActive: true,
        activationToken: null
      })
      .where(eq(users.id, id))
      .returning();

    return activatedUser;
  }

  /**
   * Generates a new activation token for the user with the given email.
   * @returns the user and token, or undefined if the user does not exist.
   *   For an already activated account, `token` is an empty string.
   */
  async generateActivationToken(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));

    if (!user) return undefined;

    // An already activated account does not get a new token
    if (user.isActive) {
      return { user, token: '' };
    }

    const token = randomBytes(32).toString('hex');

    await db
      .update(users)
      .set({ activationToken: token })
      .where(eq(users.id, user.id));

    return { user, token };
  }

  async getUserByActivationToken(token: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.activationToken, token));
    
    return user;
  }

  /**
   * Generates a password reset token valid for 1 hour.
   * @returns the user and token, or undefined if the email is not registered
   */
  async generateResetToken(email: string) {
    // Find the user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!user) return undefined;

    // Vygenerovat token pro reset hesla
    const token = randomBytes(32).toString('hex');
    const expiresDate = new Date();
    expiresDate.setHours(expiresDate.getHours() + 1); // Token valid for 1 hour

    // Store the token and its expiry in the database
    await db
      .update(users)
      .set({
        resetPasswordToken: token,
        resetPasswordExpires: expiresDate
      })
      .where(eq(users.id, user.id));

    return { user, token };
  }

  async getUserByResetToken(token: string) {
    const currentDate = new Date();
    
    // Find the user with a valid token
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.resetPasswordToken, token),
          gte(users.resetPasswordExpires, currentDate)
        )
      );
    
    return user;
  }

  /**
   * Sets a new password based on a valid reset token.
   * The password is hashed here – the caller passes it in plain form.
   */
  async resetPassword(token: string, newPassword: string) {
    const user = await this.getUserByResetToken(token);

    if (!user) return false;

    const hashedPassword = await hashPassword(newPassword);

    // Aktualizovat heslo a zneplatnit token
    await db
      .update(users)
      .set({
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      })
      .where(eq(users.id, user.id));

    return true;
  }

  /**
   * Changes a user's password. `newPassword` is expected in **plain text** –
   * it is hashed here, exactly as in {@link createUser} and {@link resetPassword}.
   */
  async changeUserPassword(userId: number, newPassword: string) {
    try {
      // Find the user by ID
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      
      if (!user) return false;
      
      // Hash of the new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Aktualizovat heslo
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId));
      
      return true;
    } catch (error) {
      console.error("Error changing the user's password in storage:", error);
      return false;
    }
  }

  async getTeamMemberProjects(userId: number) {
    const result = await db
      .select({ project: projects })
      .from(teamMembers)
      .innerJoin(projects, eq(teamMembers.projectId, projects.id))
      .where(eq(teamMembers.userId, userId));
    
    return result.map(r => r.project);
  }

  // Note: this function remains for backward compatibility; prefer updateUserLastLogin
  async updateLastLogin(id: number) {
    return this.updateUserLastLogin(id);
  }

  // Projekty
  async getProject(id: number) {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjects() {
    return await db.select().from(projects);
  }

  async getProjectsByUser(userId: number) {
    // Get the projects where the user is the owner
    const ownedProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId));
    
    // Get the projects where the user is a team member
    const teamProjects = await this.getTeamMemberProjects(userId);
    
    // Spojit a odstranit duplicity
    const allProjects = [...ownedProjects, ...teamProjects];
    const uniqueProjects = Array.from(
      new Map(allProjects.map(project => [project.id, project])).values()
    );
    
    return uniqueProjects;
  }

  async createProject(project: any, ownerId: number) {
    const [createdProject] = await db
      .insert(projects)
      .values({ ...project, ownerId })
      .returning();
    
    // Create the default training options
    await this.createTrainingOptions({
      projectId: createdProject.id,
      contextSize: 2000,
      responseStyle: "balanced",
      customPromptTemplate: null,
      useKeywordsExtraction: true,
      useSemanticSearch: true,
      maxDocuments: 3,
      documentChunkSize: 1000,
      enableCitationGeneration: false,
      temperatureValue: 7,
      customStopWords: null
    });
    
    return createdProject;
  }

  async updateProject(id: number, project: any) {
    const [updatedProject] = await db
      .update(projects)
      .set(project)
      .where(eq(projects.id, id))
      .returning();
    return updatedProject;
  }

  async deleteProject(id: number) {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async checkProjectOwnership(projectId: number, userId: number) {
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerId, userId)
        )
      );
    
    return !!project;
  }

  async checkProjectAccess(projectId: number, userId: number) {
    // Check whether the user owns the project
    const isOwner = await this.checkProjectOwnership(projectId, userId);
    if (isOwner) return true;
    
    // Check whether the user is a member of the project team
    const teamMember = await this.getTeamMember(projectId, userId);
    return !!teamMember;
  }

  async getApiStats(projectId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    // Total number of calls
    const totalCalls = await db.select({ count: count() }).from(apiCalls)
      .where(eq(apiCalls.projectId, projectId));
      
    // Calls made in the last month
    const monthCalls = await db.select({ count: count() }).from(apiCalls)
      .where(and(
        eq(apiCalls.projectId, projectId),
        gte(apiCalls.createdAt, oneMonthAgo)
      ));
      
    // Calls made in the last week
    const weekCalls = await db.select({ count: count() }).from(apiCalls)
      .where(and(
        eq(apiCalls.projectId, projectId),
        gte(apiCalls.createdAt, oneWeekAgo)
      ));
      
    // Calls made today
    const todayCalls = await db.select({ count: count() }).from(apiCalls)
      .where(and(
        eq(apiCalls.projectId, projectId),
        gte(apiCalls.createdAt, today)
      ));
    
    return {
      total: totalCalls[0]?.count || 0,
      lastMonth: monthCalls[0]?.count || 0,
      lastWeek: weekCalls[0]?.count || 0,
      today: todayCalls[0]?.count || 0
    };
  }
  
  // Team members
  async getTeamMembers(projectId: number) {
    return await db
      .select({
        id: teamMembers.id,
        projectId: teamMembers.projectId,
        userId: teamMembers.userId,
        role: teamMembers.role,
        createdAt: teamMembers.createdAt,
        user: {
          id: users.id,
          username: users.username,
          email: users.email
        }
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.projectId, projectId));
  }

  async getTeamMembersWithUserDetails(projectId: number) {
    const result = await db
      .select({
        teamMember: teamMembers,
        user: users
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.projectId, projectId));
    
    return result.map(r => ({ ...r.teamMember, user: r.user }));
  }

  async getTeamMember(projectId: number, userId: number) {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.projectId, projectId),
          eq(teamMembers.userId, userId)
        )
      );
    return member;
  }

  async addTeamMember(teamMember: any) {
    const [member] = await db
      .insert(teamMembers)
      .values(teamMember)
      .returning();
    return member;
  }

  /**
   * Changes a team member's role within a project.
   * @returns the updated record, or undefined if the member is not in the project
   */
  async updateTeamMemberRole(projectId: number, userId: number, role: string) {
    const [updated] = await db
      .update(teamMembers)
      .set({ role: role as any })
      .where(
        and(
          eq(teamMembers.projectId, projectId),
          eq(teamMembers.userId, userId)
        )
      )
      .returning();
    return updated;
  }

  /** @returns true if the member was actually removed, false if they were not in the project */
  async removeTeamMember(projectId: number, userId: number): Promise<boolean> {
    const deleted = await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.projectId, projectId),
          eq(teamMembers.userId, userId)
        )
      )
      .returning();
    return deleted.length > 0;
  }

  async getProjectsSharedWithUser(userId: number) {
    const result = await db
      .select({
        project: projects
      })
      .from(teamMembers)
      .innerJoin(projects, eq(teamMembers.projectId, projects.id))
      .where(eq(teamMembers.userId, userId));
    
    return result.map(r => r.project);
  }
  
  // Global team
  /**
   * Returns the users the given owner has added to their global team.
   * Returns the user details directly (id, username, email), because that is exactly
   * what the team management UI needs.
   */
  async getGlobalTeamMembers(ownerId: number) {
    return await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
      })
      .from(globalTeamMembers)
      .innerJoin(users, eq(globalTeamMembers.memberId, users.id))
      .where(eq(globalTeamMembers.ownerId, ownerId))
      .orderBy(users.username);
  }

  async getGlobalTeamMember(ownerId: number, memberId: number) {
    const [member] = await db
      .select()
      .from(globalTeamMembers)
      .where(
        and(
          eq(globalTeamMembers.ownerId, ownerId),
          eq(globalTeamMembers.memberId, memberId)
        )
      );
    return member;
  }

  /**
   * Adds the user with the given email to the owner's global team.
   * @throws When no user with that email exists, or it is the owner themselves
   */
  async addGlobalTeamMember(ownerId: number, email: string) {
    const [member] = await db.select().from(users).where(eq(users.email, email));

    if (!member) {
      throw new Error(`No user with the email ${email} was found`);
    }

    if (member.id === ownerId) {
      throw new Error("You cannot add yourself to your own team");
    }

    const existing = await this.getGlobalTeamMember(ownerId, member.id);
    if (existing) {
      throw new Error("The user is already a member of your team");
    }

    await db
      .insert(globalTeamMembers)
      .values({ ownerId, memberId: member.id })
      .returning();

    // Return the shape expected by the team management UI
    return {
      id: member.id,
      username: member.username,
      email: member.email,
    };
  }

  /** @returns true if the member was actually removed, false if they were not in the team */
  async removeGlobalTeamMember(ownerId: number, memberId: number): Promise<boolean> {
    const deleted = await db
      .delete(globalTeamMembers)
      .where(
        and(
          eq(globalTeamMembers.ownerId, ownerId),
          eq(globalTeamMembers.memberId, memberId)
        )
      )
      .returning();
    return deleted.length > 0;
  }
  
  // PDF soubory
  async getPdf(id: number) {
    const [pdf] = await db.select().from(pdfs).where(eq(pdfs.id, id));
    return pdf;
  }

  async getPdfs(projectId: number) {
    return await db
      .select()
      .from(pdfs)
      .where(eq(pdfs.projectId, projectId))
      .orderBy(desc(pdfs.createdAt));
  }

  async getPDFById(pdfId: number) {
    const [pdf] = await db
      .select()
      .from(pdfs)
      .where(eq(pdfs.id, pdfId));
    return pdf;
  }

  async createPdf(pdf: any) {
    const [createdPdf] = await db.insert(pdfs).values(pdf).returning();
    return createdPdf;
  }

  async updatePdf(id: number, pdf: any) {
    const [updatedPdf] = await db
      .update(pdfs)
      .set(pdf)
      .where(eq(pdfs.id, id))
      .returning();
    return updatedPdf;
  }

  async deletePdf(id: number) {
    // First delete all chunks associated with this PDF
    await db.delete(documentChunks).where(eq(documentChunks.pdfId, id));
    console.log(`[Storage] Deleted the document chunks for PDF ID: ${id}`);
    
    // Then delete the PDF record
    await db.delete(pdfs).where(eq(pdfs.id, id));
    console.log(`[Storage] Deleted the PDF record ID: ${id}`);
  }

  async getPdfCountByProject(projectId: number) {
    const result = await db
      .select({ count: count() })
      .from(pdfs)
      .where(eq(pdfs.projectId, projectId));
    
    return result[0]?.count || 0;
  }

  async updatePdfContent(id: number, content: string) {
    await db
      .update(pdfs)
      .set({ content })
      .where(eq(pdfs.id, id));
  }
  
  // Chat sessions
  async getChatSession(id: number) {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session;
  }

  async getChatSessions(projectId: number, limit?: number) {
    const query = db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.projectId, projectId))
      .orderBy(desc(chatSessions.lastActiveAt));

    return limit ? await query.limit(limit) : await query;
  }

  /**
   * Creates a chat session. Typed rather than `any` on purpose: a caller once
   * passed sessionId/userIdentifier/userIp/userAgent, none of which are columns,
   * and omitted the NOT NULL visitorId. `any` let it compile and it failed at
   * runtime instead.
   */
  async createChatSession(session: InsertChatSession) {
    const [createdSession] = await db
      .insert(chatSessions)
      .values({
        ...session,
        lastActiveAt: new Date()
      })
      .returning();
    return createdSession;
  }

  async updateChatSession(id: number, session: any) {
    const [updatedSession] = await db
      .update(chatSessions)
      .set({
        ...session,
        lastActiveAt: new Date()
      })
      .where(eq(chatSessions.id, id))
      .returning();
    return updatedSession;
  }

  async rateChatSession(sessionId: number, rating: number) {
    const [updatedSession] = await db
      .update(chatSessions)
      .set({
        rating: rating,
        ratedAt: new Date(),
        lastActiveAt: new Date()
      })
      .where(eq(chatSessions.id, sessionId))
      .returning();
    return updatedSession;
  }

  async getChatbotAnalyticsStats(projectId: number) {
    try {
      // Total number of chat sessions
      const totalSessionsResult = await db
        .select({ count: count() })
        .from(chatSessions)
        .where(eq(chatSessions.projectId, projectId));

      // Number of rated sessions
      const ratedSessionsResult = await db
        .select({ count: count() })
        .from(chatSessions)
        .where(and(
          eq(chatSessions.projectId, projectId),
          isNotNull(chatSessions.rating)
        ));

      // Average rating
      const avgRatingResult = await db
        .select({ 
          avgRating: sql`AVG(${chatSessions.rating})`.as('avgRating'),
          totalRated: count(chatSessions.rating).as('totalRated')
        })
        .from(chatSessions)
        .where(and(
          eq(chatSessions.projectId, projectId),
          isNotNull(chatSessions.rating)
        ));

      // Rating distribution (1-5 stars)
      const ratingDistributionResult = await db
        .select({ 
          rating: chatSessions.rating,
          count: count()
        })
        .from(chatSessions)
        .where(and(
          eq(chatSessions.projectId, projectId),
          isNotNull(chatSessions.rating)
        ))
        .groupBy(chatSessions.rating)
        .orderBy(chatSessions.rating);

      return {
        totalSessions: totalSessionsResult[0]?.count || 0,
        ratedSessions: ratedSessionsResult[0]?.count || 0,
        averageRating: avgRatingResult[0]?.avgRating ? parseFloat(String(avgRatingResult[0].avgRating)) : null,
        totalRated: Number(avgRatingResult[0]?.totalRated) || 0,
        ratingDistribution: ratingDistributionResult || []
      };
    } catch (error) {
      console.error('Error retrieving the rating statistics:', error);
      return {
        totalSessions: 0,
        ratedSessions: 0,
        averageRating: null,
        totalRated: 0,
        ratingDistribution: []
      };
    }
  }
  
  // For backward compatibility - only updates the last-activity timestamp
  async updateChatSessionActivity(id: number) {
    return this.updateChatSession(id, {});
  }

  async updateChatSessionRating(sessionId: number | string, rating: number) {
    const sessionIdNumber = typeof sessionId === 'string' ? parseInt(sessionId) : sessionId;
    
    await db
      .update(chatSessions)
      .set({ rating: rating, ratedAt: new Date() })
      .where(eq(chatSessions.id, sessionIdNumber));
    
    console.log(`Rating ${rating} saved for session ${sessionIdNumber}`);
  }

  async getProjectByToken(token: string) {
    const projectsList = await db
      .select()
      .from(projects)
      .where(eq(projects.embedToken, token));
    
    return projectsList.length > 0 ? projectsList[0] : null;
  }

  async deleteChatSession(id: number) {
    // First delete the messages in this chat session
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
    
    // Then delete the chat session itself
    await db.delete(chatSessions).where(eq(chatSessions.id, id));
  }

  async getChatSessionsByVisitorId(projectId: number, visitorId: string) {
    return await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.projectId, projectId),
          eq(chatSessions.visitorId, visitorId)
        )
      )
      .orderBy(desc(chatSessions.lastActiveAt));
  }

  async deleteOldChatSessions(days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Get the IDs of the chat sessions to delete
    const sessionsToDelete = await db
      .select()
      .from(chatSessions)
      .where(lt(chatSessions.lastActiveAt, cutoffDate));
    
    const sessionIds = sessionsToDelete.map(session => session.id);
    
    if (sessionIds.length === 0) {
      return 0;
    }
    
    // Smazat related query to topics
    const messagesToDelete = await db
      .select()
      .from(chatMessages)
      .where(inArray(chatMessages.sessionId, sessionIds));
    
    const messageIds = messagesToDelete.map(message => message.id);
    
    if (messageIds.length > 0) {
      await db
        .delete(queryToTopics)
        .where(inArray(queryToTopics.messageId, messageIds));
    }
    
    // Smazat chat messages
    await db
      .delete(chatMessages)
      .where(inArray(chatMessages.sessionId, sessionIds));
    
    // Smazat chat sessions
    const result = await db
      .delete(chatSessions)
      .where(inArray(chatSessions.id, sessionIds));
    
    return sessionsToDelete.length;
  }
  
  // Chat messages
  async getChatMessage(id: number) {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return message;
  }

  async getChatMessages(sessionId: number) {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));
  }

  async getLastChatMessagesByProject(
    projectId: number,
    limit: number
  ) {
    const result = await db
      .select({
        chatMessage: chatMessages,
        session: chatSessions
      })
      .from(chatMessages)
      .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
      .where(eq(chatSessions.projectId, projectId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    
    return result.map(r => ({ ...r.chatMessage, session: r.session }));
  }

  async createChatMessage(message: any) {
    const [createdMessage] = await db.insert(chatMessages).values(message).returning();
    
    // Aktualizovat lastActiveAt u chat session
    await db
      .update(chatSessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(chatSessions.id, message.sessionId));
    
    return createdMessage;
  }

  async updateChatMessage(id: number, message: any) {
    const [updatedMessage] = await db
      .update(chatMessages)
      .set(message)
      .where(eq(chatMessages.id, id))
      .returning();
    return updatedMessage;
  }

  async deleteChatMessage(id: number) {
    await db.delete(chatMessages).where(eq(chatMessages.id, id));
  }
  
  // API calls
  async getApiCall(id: number) {
    const [call] = await db.select().from(apiCalls).where(eq(apiCalls.id, id));
    return call;
  }

  async getApiCalls(projectId: number) {
    return await db
      .select()
      .from(apiCalls)
      .where(eq(apiCalls.projectId, projectId))
      .orderBy(desc(apiCalls.createdAt));
  }

  async createApiCall(call: any) {
    const [createdCall] = await db.insert(apiCalls).values(call).returning();
    return createdCall;
  }

  async updateApiCall(id: number, call: any) {
    const [updatedCall] = await db
      .update(apiCalls)
      .set(call)
      .where(eq(apiCalls.id, id))
      .returning();
    return updatedCall;
  }

  async deleteApiCall(id: number) {
    await db.delete(apiCalls).where(eq(apiCalls.id, id));
  }

  async getApiKeyForProject(projectId: number) {
    const project = await this.getProject(projectId);
    return project?.apiKey;
  }

  async regenerateApiKey(projectId: number) {
    const newApiKey = randomBytes(32).toString('hex');
    
    await db
      .update(projects)
      .set({ apiKey: newApiKey })
      .where(eq(projects.id, projectId));
    
    return newApiKey;
  }

  async getProjectByApiKey(apiKey: string) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.apiKey, apiKey));
    
    return project;
  }

  async getApiCallCount(projectId: number, period: string) {
    let dateFilter;
    
    if (period) {
      const cutoffDate = new Date();
      
      if (period === 'day') {
        cutoffDate.setDate(cutoffDate.getDate() - 1);
      } else if (period === 'week') {
        cutoffDate.setDate(cutoffDate.getDate() - 7);
      } else if (period === 'month') {
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
      }
      
      dateFilter = gte(apiCalls.createdAt, cutoffDate);
    }
    
    // Drizzle does not allow calling .where() twice, so conditions are composed up front
    const conditions = [eq(apiCalls.projectId, projectId)];
    if (dateFilter) {
      conditions.push(dateFilter);
    }

    const result = await db
      .select({ count: count() })
      .from(apiCalls)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }
  
  // Training options
  async getTrainingOptions(projectId: number) {
    const [options] = await db
      .select()
      .from(trainingOptions)
      .where(eq(trainingOptions.projectId, projectId));
    
    return options;
  }

  async createTrainingOptions(options: any) {
    const [createdOptions] = await db
      .insert(trainingOptions)
      .values({
        ...options,
        updatedAt: new Date()
      })
      .returning();
    return createdOptions;
  }

  async updateTrainingOptions(projectId: number, options: any) {
    const [updatedOptions] = await db
      .update(trainingOptions)
      .set({
        ...options,
        updatedAt: new Date()
      })
      .where(eq(trainingOptions.projectId, projectId))
      .returning();
    return updatedOptions;
  }
  
  // Processed documents
  async getProcessedDocument(id: number) {
    const [doc] = await db
      .select()
      .from(processedDocuments)
      .where(eq(processedDocuments.id, id));
    return doc;
  }

  async getProcessedDocuments(projectId: number) {
    return await db
      .select()
      .from(processedDocuments)
      .where(eq(processedDocuments.projectId, projectId))
      .orderBy(desc(processedDocuments.processingDate));
  }

  async createProcessedDocument(doc: any) {
    const [createdDoc] = await db
      .insert(processedDocuments)
      .values({
        ...doc,
        processingDate: new Date()
      })
      .returning();
    return createdDoc;
  }

  async deleteProcessedDocument(id: number) {
    await db.delete(processedDocuments).where(eq(processedDocuments.id, id));
  }

  /**
   * Deletes all processed documents belonging to the given PDF.
   * Used before reprocessing so that no orphaned chunks remain.
   */
  async deleteProcessedDocumentsByPdfId(pdfId: number) {
    await db
      .delete(processedDocuments)
      .where(eq(processedDocuments.pdfId, pdfId));
  }

  async getProcessedDocumentByPdfId(pdfId: number) {
    const [doc] = await db
      .select()
      .from(processedDocuments)
      .where(eq(processedDocuments.pdfId, pdfId))
      .orderBy(desc(processedDocuments.processingDate));
    return doc;
  }
  
  // Query topics
  async getQueryTopic(id: number) {
    const [topic] = await db.select().from(queryTopics).where(eq(queryTopics.id, id));
    return topic;
  }

  async getQueryTopics(projectId: number) {
    return await db
      .select()
      .from(queryTopics)
      .where(eq(queryTopics.projectId, projectId))
      .orderBy(desc(queryTopics.count));
  }

  async createQueryTopic(topic: any) {
    const [createdTopic] = await db
      .insert(queryTopics)
      .values({
        ...topic,
        count: 1,
        lastQueried: new Date()
      })
      .returning();
    return createdTopic;
  }

  async updateQueryTopic(id: number, topic: any) {
    const [updatedTopic] = await db
      .update(queryTopics)
      .set({
        ...topic,
        lastQueried: new Date()
      })
      .where(eq(queryTopics.id, id))
      .returning();
    return updatedTopic;
  }

  async deleteQueryTopic(id: number) {
    // First delete the links to messages
    await db.delete(queryToTopics).where(eq(queryToTopics.topicId, id));
    
    // Then delete the topic
    await db.delete(queryTopics).where(eq(queryTopics.id, id));
  }

  async addQueryToTopic(mapping: any) {
    const [createdMapping] = await db
      .insert(queryToTopics)
      .values(mapping)
      .returning();
    
    // Increment the counter and update the date of the last query
    await db
      .update(queryTopics)
      .set({
        count: sql`${queryTopics.count} + 1`,
        lastQueried: new Date()
      })
      .where(eq(queryTopics.id, mapping.topicId));
    
    return createdMapping;
  }

  async getTopQueryTopics(projectId: number, limit: number) {
    return await db
      .select()
      .from(queryTopics)
      .where(eq(queryTopics.projectId, projectId))
      .orderBy(desc(queryTopics.count))
      .limit(limit);
  }

  async findTopicByName(projectId: number, name: string) {
    const [topic] = await db
      .select()
      .from(queryTopics)
      .where(
        and(
          eq(queryTopics.projectId, projectId),
          eq(queryTopics.name, name)
        )
      );
    return topic;
  }

  async getRelatedQueryTopics(topicId: number, limit: number) {
    // Get the messages associated with the given topic
    const topicMessages = await db
      .select()
      .from(queryToTopics)
      .where(eq(queryToTopics.topicId, topicId));
    
    if (topicMessages.length === 0) {
      return [];
    }
    
    const messageIds = topicMessages.map(m => m.messageId);
    
    // Get the topics associated with the same messages
    const relatedTopicIds = await db
      .select({
        topicId: queryToTopics.topicId,
        count: count()
      })
      .from(queryToTopics)
      .where(
        and(
          inArray(queryToTopics.messageId, messageIds),
          not(eq(queryToTopics.topicId, topicId))
        )
      )
      .groupBy(queryToTopics.topicId)
      .orderBy(desc(sql`count`))
      .limit(limit);
    
    if (relatedTopicIds.length === 0) {
      return [];
    }
    
    // Get details of the related topics
    const topicIdsList = relatedTopicIds.map(t => t.topicId);
    
    return await db
      .select()
      .from(queryTopics)
      .where(inArray(queryTopics.id, topicIdsList))
      .orderBy(desc(queryTopics.count));
  }
  
  // Analytika chatbotu
  async getChatbotAnalytics(id: number) {
    const [analytics] = await db
      .select()
      .from(chatbotAnalytics)
      .where(eq(chatbotAnalytics.id, id));
    return analytics;
  }

  async getChatbotAnalyticsByProject(projectId: number) {
    return await db
      .select()
      .from(chatbotAnalytics)
      .where(eq(chatbotAnalytics.projectId, projectId))
      .orderBy(desc(chatbotAnalytics.createdAt));
  }

  /**
   * Project analytics data with optional filtering by date and record count.
   * @param startDate inclusive
   * @param endDate exclusive (records older than this moment)
   */
  async getChatbotAnalyticsForProject(
    projectId: number,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ) {
    const conditions = [eq(chatbotAnalytics.projectId, projectId)];

    if (startDate) {
      conditions.push(gte(chatbotAnalytics.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lt(chatbotAnalytics.createdAt, endDate));
    }

    const query = db
      .select()
      .from(chatbotAnalytics)
      .where(and(...conditions))
      .orderBy(desc(chatbotAnalytics.createdAt));

    return limit ? await query.limit(limit) : await query;
  }

  async createChatbotAnalytics(analytics: any) {
    const [createdAnalytics] = await db
      .insert(chatbotAnalytics)
      .values(analytics)
      .returning();
    return createdAnalytics;
  }

  async getChatbotStats(projectId: number) {
    // Total number of views
    const viewsResult = await db
      .select({ count: count() })
      .from(chatbotAnalytics)
      .where(
        and(
          eq(chatbotAnalytics.projectId, projectId),
          eq(chatbotAnalytics.action, 'open')
        )
      );
    
    // Total number of interactions (queries)
    const interactionsResult = await db
      .select({ count: count() })
      .from(chatbotAnalytics)
      .where(
        and(
          eq(chatbotAnalytics.projectId, projectId),
          eq(chatbotAnalytics.action, 'query')
        )
      );
    
    // Number of unique visitors
    const visitorsResult = await db
      .select({ 
        uniqueVisitors: sql`count(distinct ${chatbotAnalytics.visitorId})` 
      })
      .from(chatbotAnalytics)
      .where(eq(chatbotAnalytics.projectId, projectId));
    
    return {
      totalViews: viewsResult[0]?.count || 0,
      totalInteractions: interactionsResult[0]?.count || 0,
      uniqueVisitors: Number(visitorsResult[0]?.uniqueVisitors || 0)
    };
  }

  async getDeviceTypeStats(projectId: number) {
    return await db
      .select({
        deviceType: chatbotAnalytics.deviceType,
        count: count()
      })
      .from(chatbotAnalytics)
      .where(
        and(
          eq(chatbotAnalytics.projectId, projectId),
          isNotNull(chatbotAnalytics.deviceType)
        )
      )
      .groupBy(chatbotAnalytics.deviceType)
      .orderBy(desc(sql`count`));
  }

  async getPageStats(projectId: number) {
    return await db
      .select({
        pageUrl: chatbotAnalytics.pageUrl,
        count: count()
      })
      .from(chatbotAnalytics)
      .where(
        and(
          eq(chatbotAnalytics.projectId, projectId),
          isNotNull(chatbotAnalytics.pageUrl)
        )
      )
      .groupBy(chatbotAnalytics.pageUrl)
      .orderBy(desc(sql`count`));
  }

  async getInteractionStats(projectId: number) {
    // Get interaction statistics per day for the last month
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    return await db
      .select({
        date: sql`to_char(${chatbotAnalytics.createdAt}, 'YYYY-MM-DD')`,
        count: count()
      })
      .from(chatbotAnalytics)
      .where(
        and(
          eq(chatbotAnalytics.projectId, projectId),
          gte(chatbotAnalytics.createdAt, oneMonthAgo)
        )
      )
      .groupBy(sql`to_char(${chatbotAnalytics.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(asc(sql`to_char(${chatbotAnalytics.createdAt}, 'YYYY-MM-DD')`));
  }

  // PDF chunks - new methods for working with parts of a PDF
  async getPdfChunks(pdfId: number) {
    return await db.query.pdfChunks.findMany({
      where: eq(pdfChunks.pdfId, pdfId),
      orderBy: pdfChunks.chunkIndex
    });
  }

  async getProjectPdfChunks(projectId: number) {
    return await db.query.pdfChunks.findMany({
      where: eq(pdfChunks.projectId, projectId)
    });
  }

  async createPdfChunk(chunk: any) {
    const [newChunk] = await db.insert(pdfChunks).values(chunk).returning();
    return newChunk;
  }

  async deletePdfChunks(pdfId: number) {
    const result = await db.delete(pdfChunks).where(eq(pdfChunks.pdfId, pdfId));
    return result.rowCount || 0;
  }

  async deleteProjectPdfChunks(projectId: number) {
    const result = await db.delete(pdfChunks).where(eq(pdfChunks.projectId, projectId));
    return result.rowCount || 0;
  }

  async getProjectStats(projectId: number) {
    // Get basic project information
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error('Projekt nenalezen');
    }

    // PDF file statistics
    const pdfStats = await db
      .select({
        count: count(),
        totalSize: sql<number>`COALESCE(SUM(${pdfs.fileSize}), 0)`,
        totalPages: sql<number>`COALESCE(SUM(${pdfs.totalPages}), 0)`
      })
      .from(pdfs)
      .where(eq(pdfs.projectId, projectId));

    // Chunk statistics from the document_chunks table
    const chunkStats = await db
      .select({
        count: count()
      })
      .from(pdfChunks)
      .where(eq(pdfChunks.projectId, projectId));

    // Chat session statistics (total number of chats)
    const chatStats = await db
      .select({
        totalChats: count(),
        uniqueUsers: sql<number>`count(distinct ${chatSessions.visitorId})`
      })
      .from(chatSessions)
      .where(eq(chatSessions.projectId, projectId));

    return {
      id: projectId,
      name: project.name,
      pdfCount: Number(pdfStats[0]?.count || 0),
      totalSize: Number(pdfStats[0]?.totalSize || 0),
      totalPages: Number(pdfStats[0]?.totalPages || 0),
      chunkCount: Number(chunkStats[0]?.count || 0),
      totalChats: Number(chatStats[0]?.totalChats || 0),
      uniqueUsers: Number(chatStats[0]?.uniqueUsers || 0),
      createdAt: project.createdAt
    };
  }

  // Failed responses
  async createFailedResponse(failedResponse: any) {
    const [created] = await db
      .insert(failedResponses)
      .values({
        ...failedResponse,
        createdAt: new Date()
      })
      .returning();
    return created;
  }

  // User activity tracking methods
  async trackUserActivity(userId: number, projectId: number, activityType = 'viewing', sessionId = null) {
    try {
      const activity = {
        userId,
        projectId,
        activityType,
        sessionId,
        lastActivity: new Date(),
        isActive: true
      };

      await db.insert(userActivity)
        .values(activity)
        .onConflictDoUpdate({
          target: userActivity.userId,
          set: {
            lastActivity: new Date(),
            activityType,
            isActive: true,
            updatedAt: new Date()
          }
        });
      
      return true;
    } catch (error) {
      console.error('Error tracking user activity:', error);
      return false;
    }
  }

  async getActiveUsersForProject(projectId: number, minutesThreshold = 5) {
    const cutoff = new Date(Date.now() - minutesThreshold * 60 * 1000);
    
    const activeUsers = await db
      .select({
        userId: userActivity.userId,
        username: users.username,
        email: users.email,
        activityType: userActivity.activityType,
        lastActivity: userActivity.lastActivity,
        sessionId: userActivity.sessionId
      })
      .from(userActivity)
      .innerJoin(users, eq(userActivity.userId, users.id))
      .where(
        and(
          eq(userActivity.projectId, projectId),
          eq(userActivity.isActive, true),
          gte(userActivity.lastActivity, cutoff)
        )
      )
      .orderBy(desc(userActivity.lastActivity));
    
    return activeUsers;
  }

  async setUserInactive(userId: number, projectId: number, sessionId = null) {
    const whereCondition = sessionId 
      ? and(
          eq(userActivity.userId, userId),
          eq(userActivity.projectId, projectId),
          eq(userActivity.sessionId, sessionId)
        )
      : and(
          eq(userActivity.userId, userId),
          eq(userActivity.projectId, projectId)
        );

    await db
      .update(userActivity)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(whereCondition);
  }
}

export const storage = new DatabaseStorage();
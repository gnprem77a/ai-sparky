import {
  type User, type InsertUser, users,
  type Conversation, conversations,
  type Message, messages,
  type UserSettings, userSettings,
  type SavedPrompt, savedPrompts,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  setAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  setPlan(id: string, plan: "free" | "pro", expiresAt: Date | null): Promise<User | undefined>;
  updatePassword(id: string, hashedPassword: string): Promise<void>;

  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationByShareToken(token: string): Promise<Conversation | undefined>;
  createConversation(userId: string, title: string, model: string): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Pick<Conversation, "title" | "model" | "updatedAt" | "isPinned" | "shareToken">>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; attachments?: string }): Promise<Message>;
  deleteMessagesFromId(conversationId: string, fromMessageId: string): Promise<void>;

  getUserSettings(userId: string): Promise<UserSettings>;
  updateUserSettings(userId: string, data: Partial<Pick<UserSettings, "systemPrompt" | "dailyMessageCount" | "lastMessageDate">>): Promise<UserSettings>;

  getSavedPrompts(userId: string): Promise<SavedPrompt[]>;
  createSavedPrompt(userId: string, title: string, content: string): Promise<SavedPrompt>;
  deleteSavedPrompt(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async setAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    const [user] = await db.update(users).set({ isAdmin }).where(eq(users.id, id)).returning();
    return user;
  }

  async setPlan(id: string, plan: "free" | "pro", expiresAt: Date | null): Promise<User | undefined> {
    const [user] = await db.update(users).set({ plan, planExpiresAt: expiresAt }).where(eq(users.id, id)).returning();
    return user;
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.isPinned), desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async getConversationByShareToken(token: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.shareToken, token));
    return conv;
  }

  async createConversation(userId: string, title: string, model: string): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values({ userId, title, model }).returning();
    return conv;
  }

  async updateConversation(id: string, data: Partial<Pick<Conversation, "title" | "model" | "updatedAt" | "isPinned" | "shareToken">>): Promise<Conversation | undefined> {
    const [conv] = await db.update(conversations).set(data).where(eq(conversations.id, id)).returning();
    return conv;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }

  async createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; attachments?: string }): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }

  async deleteMessagesFromId(conversationId: string, fromMessageId: string): Promise<void> {
    const allMsgs = await this.getMessages(conversationId);
    const idx = allMsgs.findIndex((m) => m.id === fromMessageId);
    if (idx === -1) return;
    const toDelete = allMsgs.slice(idx);
    for (const msg of toDelete) {
      await db.delete(messages).where(eq(messages.id, msg.id));
    }
  }

  async getUserSettings(userId: string): Promise<UserSettings> {
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
    if (!settings) {
      const [created] = await db.insert(userSettings).values({ userId }).returning();
      return created;
    }
    return settings;
  }

  async updateUserSettings(userId: string, data: Partial<Pick<UserSettings, "systemPrompt" | "dailyMessageCount" | "lastMessageDate">>): Promise<UserSettings> {
    await this.getUserSettings(userId);
    const [updated] = await db.update(userSettings).set(data).where(eq(userSettings.userId, userId)).returning();
    return updated;
  }

  async getSavedPrompts(userId: string): Promise<SavedPrompt[]> {
    return db.select().from(savedPrompts)
      .where(eq(savedPrompts.userId, userId))
      .orderBy(desc(savedPrompts.createdAt));
  }

  async createSavedPrompt(userId: string, title: string, content: string): Promise<SavedPrompt> {
    const [prompt] = await db.insert(savedPrompts).values({ userId, title, content }).returning();
    return prompt;
  }

  async deleteSavedPrompt(id: string): Promise<void> {
    await db.delete(savedPrompts).where(eq(savedPrompts.id, id));
  }
}

export const storage = new DatabaseStorage();

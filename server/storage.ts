import {
  type User, type InsertUser, users,
  type Conversation, conversations,
  type Message, messages,
  type UserSettings, userSettings,
  type SavedPrompt, savedPrompts,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, ilike, or } from "drizzle-orm";

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
  updateConversation(id: string, data: Partial<Pick<Conversation, "title" | "model" | "updatedAt" | "isPinned" | "shareToken" | "tags">>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; attachments?: string; inputTokens?: number; outputTokens?: number }): Promise<Message>;
  updateMessage(id: string, data: Partial<Pick<Message, "reaction" | "content">>): Promise<Message | undefined>;
  deleteMessagesFromId(conversationId: string, fromMessageId: string): Promise<void>;
  getTokenStats(): Promise<{ totalInputTokens: number; totalOutputTokens: number; byUser: { userId: string; username: string; inputTokens: number; outputTokens: number }[] }>;
  searchMessages(userId: string, query: string): Promise<{ conversationId: string; conversationTitle: string; messageId: string; snippet: string; role: string }[]>;

  getUserSettings(userId: string): Promise<UserSettings>;
  updateUserSettings(userId: string, data: Partial<Pick<UserSettings, "systemPrompt" | "dailyMessageCount" | "lastMessageDate" | "fontSize" | "assistantName" | "activePromptId">>): Promise<UserSettings>;

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

  async updateConversation(id: string, data: Partial<Pick<Conversation, "title" | "model" | "updatedAt" | "isPinned" | "shareToken" | "tags">>): Promise<Conversation | undefined> {
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

  async createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; attachments?: string; inputTokens?: number; outputTokens?: number }): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }

  async updateMessage(id: string, data: Partial<Pick<Message, "reaction" | "content">>): Promise<Message | undefined> {
    const [msg] = await db.update(messages).set(data).where(eq(messages.id, id)).returning();
    return msg;
  }

  async getTokenStats(): Promise<{ totalInputTokens: number; totalOutputTokens: number; byUser: { userId: string; username: string; inputTokens: number; outputTokens: number }[] }> {
    const allUsers = await db.select().from(users);
    const allConvs = await db.select().from(conversations);
    const allMsgs = await db.select().from(messages).where(eq(messages.role, "assistant"));

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const userTokenMap: Record<string, { inputTokens: number; outputTokens: number }> = {};

    for (const msg of allMsgs) {
      const input = msg.inputTokens ?? 0;
      const output = msg.outputTokens ?? 0;
      totalInputTokens += input;
      totalOutputTokens += output;

      const conv = allConvs.find((c) => c.id === msg.conversationId);
      if (conv) {
        if (!userTokenMap[conv.userId]) userTokenMap[conv.userId] = { inputTokens: 0, outputTokens: 0 };
        userTokenMap[conv.userId].inputTokens += input;
        userTokenMap[conv.userId].outputTokens += output;
      }
    }

    const byUser = allUsers.map((u) => ({
      userId: u.id,
      username: u.username,
      inputTokens: userTokenMap[u.id]?.inputTokens ?? 0,
      outputTokens: userTokenMap[u.id]?.outputTokens ?? 0,
    }));

    return { totalInputTokens, totalOutputTokens, byUser };
  }

  async searchMessages(userId: string, query: string): Promise<{ conversationId: string; conversationTitle: string; messageId: string; snippet: string; role: string }[]> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const convIds = userConvs.map((c) => c.id);
    if (convIds.length === 0) return [];

    const results: { conversationId: string; conversationTitle: string; messageId: string; snippet: string; role: string }[] = [];
    const lq = query.toLowerCase();

    for (const conv of userConvs) {
      if (conv.title.toLowerCase().includes(lq)) {
        results.push({ conversationId: conv.id, conversationTitle: conv.title, messageId: "", snippet: conv.title, role: "title" });
      }
    }

    for (const conv of userConvs) {
      const msgs = await db.select().from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(200);
      for (const msg of msgs) {
        if (msg.content.toLowerCase().includes(lq)) {
          const idx = msg.content.toLowerCase().indexOf(lq);
          const start = Math.max(0, idx - 40);
          const end = Math.min(msg.content.length, idx + query.length + 80);
          const snippet = (start > 0 ? "…" : "") + msg.content.slice(start, end) + (end < msg.content.length ? "…" : "");
          results.push({ conversationId: conv.id, conversationTitle: conv.title, messageId: msg.id, snippet, role: msg.role });
        }
      }
    }

    return results.slice(0, 30);
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

  async updateUserSettings(userId: string, data: Partial<Pick<UserSettings, "systemPrompt" | "dailyMessageCount" | "lastMessageDate" | "fontSize" | "assistantName" | "activePromptId">>): Promise<UserSettings> {
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

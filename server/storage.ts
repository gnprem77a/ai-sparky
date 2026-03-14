import {
  type User, type InsertUser, users,
  type Conversation, conversations,
  type Message, messages,
  type UserSettings, userSettings,
  type SavedPrompt, savedPrompts,
  type Folder, folders,
  type UserMemory, userMemories,
  type Broadcast, type InsertBroadcast, broadcasts,
  type AiProvider, type InsertAiProvider, aiProviders,
  type StudyNote, type StudyOutput, studyNotes, studyOutputs,
  type KnowledgeBase, type KbDocument, type KbChunk,
  knowledgeBases, kbDocuments, kbChunks,
  type ApiLog, apiLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, gte, or, isNull, sql as drizzleSql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByApiKey(apiKey: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  setAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  setPlan(id: string, plan: "free" | "pro", expiresAt: Date | null): Promise<User | undefined>;
  updatePassword(id: string, hashedPassword: string): Promise<void>;
  setApiKey(id: string, apiKey: string | null): Promise<User | undefined>;
  setApiEnabled(id: string, enabled: boolean): Promise<User | undefined>;
  setApiSettings(id: string, settings: Partial<Pick<User, "apiDailyLimit" | "apiMonthlyLimit" | "apiWebhookUrl" | "apiRateLimitPerMin" | "email">>): Promise<User | undefined>;
  incrementApiUsage(id: string): Promise<{ allowed: boolean; dailyUsed: number; dailyLimit: number | null; monthlyUsed: number; monthlyLimit: number | null; limitType: "daily" | "monthly" | null }>;
  createApiLog(data: { userId: string; messages: string; response: string | null; inputTokens: number; outputTokens: number }): Promise<ApiLog>;
  getApiLogs(userId: string, limit?: number): Promise<ApiLog[]>;

  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationByShareToken(token: string): Promise<Conversation | undefined>;
  createConversation(userId: string, title: string, model: string): Promise<Conversation>;
  updateConversation(id: string, data: Partial<Pick<Conversation, "title" | "model" | "updatedAt" | "isPinned" | "shareToken" | "tags" | "folderId">>): Promise<Conversation | undefined>;
  deleteConversation(id: string): Promise<void>;

  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; attachments?: string; inputTokens?: number; outputTokens?: number; toolCalls?: string; sources?: string }): Promise<Message>;
  updateMessage(id: string, data: Partial<Pick<Message, "reaction" | "content" | "isPinned">>): Promise<Message | undefined>;
  pinMessage(messageId: string, isPinned: boolean): Promise<Message | undefined>;
  deleteMessagesFromId(conversationId: string, fromMessageId: string): Promise<void>;
  getTokenStats(): Promise<{ totalInputTokens: number; totalOutputTokens: number; byUser: { userId: string; username: string; inputTokens: number; outputTokens: number }[] }>;
  searchMessages(userId: string, query: string): Promise<{ conversationId: string; conversationTitle: string; messageId: string; snippet: string; role: string }[]>;

  getUserSettings(userId: string): Promise<UserSettings>;
  updateUserSettings(userId: string, data: Partial<Pick<UserSettings, "systemPrompt" | "dailyMessageCount" | "lastMessageDate" | "fontSize" | "assistantName" | "activePromptId" | "defaultModel" | "autoScroll" | "autoTitle" | "showTokenUsage" | "customInstructions" | "notificationSound" | "responseLanguage">>): Promise<UserSettings>;
  deleteAllConversations(userId: string): Promise<void>;

  getSavedPrompts(userId: string): Promise<SavedPrompt[]>;
  createSavedPrompt(userId: string, title: string, content: string): Promise<SavedPrompt>;
  deleteSavedPrompt(id: string): Promise<void>;

  getFolders(userId: string): Promise<Folder[]>;
  createFolder(userId: string, name: string, color: string): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  moveConversationToFolder(conversationId: string, folderId: string | null): Promise<Conversation | undefined>;

  getAnalyticsOverview(userId: string): Promise<{ totalConversations: number; totalMessages: number; totalTokens: number; avgTokensPerMessage: number }>;
  getAnalyticsDaily(userId: string): Promise<{ date: string; messageCount: number; tokenCount: number }[]>;
  getAnalyticsModels(userId: string): Promise<{ model: string; count: number; percentage: number }[]>;
  getAnalyticsPeakHours(userId: string): Promise<{ hour: number; count: number }[]>;
  getAnalyticsCost(userId: string): Promise<{ estimatedCostUsd: number; byModel: { model: string; costUsd: number }[] }>;
  getAnalyticsTopConversations(userId: string): Promise<{ id: string; title: string; totalTokens: number }[]>;

  getMemories(userId: string): Promise<UserMemory[]>;
  createMemory(userId: string, content: string): Promise<UserMemory>;
  deleteMemory(id: string): Promise<void>;
  getGalleryImages(userId: string): Promise<{ messageId: string; conversationId: string; conversationTitle: string; imageData: string; createdAt: Date }[]>;

  getActiveBroadcast(): Promise<Broadcast | undefined>;
  createBroadcast(data: InsertBroadcast): Promise<Broadcast>;
  getAllBroadcasts(): Promise<Broadcast[]>;

  getProviders(): Promise<AiProvider[]>;
  getActiveProviders(): Promise<AiProvider[]>;
  getProvider(id: string): Promise<AiProvider | undefined>;
  createProvider(data: InsertAiProvider): Promise<AiProvider>;
  updateProvider(id: string, data: Partial<InsertAiProvider>): Promise<AiProvider | undefined>;
  deleteProvider(id: string): Promise<void>;
  setActiveProvider(id: string): Promise<void>;
  reorderProviders(ids: string[]): Promise<void>;

  getStudyNotes(userId: string): Promise<StudyNote[]>;
  getStudyNote(id: string): Promise<StudyNote | undefined>;
  createStudyNote(userId: string, title: string, content: string): Promise<StudyNote>;
  updateStudyNote(id: string, data: Partial<Pick<StudyNote, "title" | "content">>): Promise<StudyNote | undefined>;
  deleteStudyNote(id: string): Promise<void>;
  getStudyOutputs(userId: string, type?: string): Promise<StudyOutput[]>;
  createStudyOutput(data: { noteId?: string; userId: string; type: string; title: string; data: unknown }): Promise<StudyOutput>;
  deleteStudyOutput(id: string): Promise<void>;

  getKnowledgeBases(userId: string): Promise<KnowledgeBase[]>;
  getKnowledgeBase(id: string): Promise<KnowledgeBase | undefined>;
  getKnowledgeBaseByToken(token: string): Promise<KnowledgeBase | undefined>;
  createKnowledgeBase(userId: string, name: string, description: string): Promise<KnowledgeBase>;
  updateKnowledgeBase(id: string, data: Partial<Pick<KnowledgeBase, "name" | "description" | "isPublic" | "shareToken">>): Promise<KnowledgeBase | undefined>;
  deleteKnowledgeBase(id: string): Promise<void>;
  getKbDocuments(kbId: string): Promise<KbDocument[]>;
  getKbDocument(id: string): Promise<KbDocument | undefined>;
  createKbDocument(data: { kbId: string; userId: string; name: string; content: string; chunkCount: number }): Promise<KbDocument>;
  deleteKbDocument(id: string): Promise<void>;
  createKbChunks(chunks: { docId: string; kbId: string; content: string; embedding: number[]; chunkIndex: number }[]): Promise<void>;
  getKbChunks(kbId: string): Promise<KbChunk[]>;
  deleteKbChunksByDoc(docId: string): Promise<void>;
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

  async getUserByApiKey(apiKey: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.apiKey, apiKey));
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

  async setApiKey(id: string, apiKey: string | null): Promise<User | undefined> {
    const [user] = await db.update(users).set({ apiKey }).where(eq(users.id, id)).returning();
    return user;
  }

  async setApiEnabled(id: string, enabled: boolean): Promise<User | undefined> {
    const [user] = await db.update(users).set({ apiEnabled: enabled }).where(eq(users.id, id)).returning();
    return user;
  }

  async setApiSettings(id: string, settings: Partial<Pick<User, "apiDailyLimit" | "apiMonthlyLimit" | "apiWebhookUrl" | "apiRateLimitPerMin" | "email">>): Promise<User | undefined> {
    const [user] = await db.update(users).set(settings).where(eq(users.id, id)).returning();
    return user;
  }

  async incrementApiUsage(id: string): Promise<{ allowed: boolean; dailyUsed: number; dailyLimit: number | null; monthlyUsed: number; monthlyLimit: number | null; limitType: "daily" | "monthly" | null }> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return { allowed: false, dailyUsed: 0, dailyLimit: null, monthlyUsed: 0, monthlyLimit: null, limitType: null };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let dailyCount = user.apiDailyCount ?? 0;
    let monthlyCount = user.apiMonthlyCount ?? 0;

    if (!user.apiDailyResetAt || user.apiDailyResetAt < today) {
      dailyCount = 0;
    }
    if (!user.apiMonthlyResetAt || user.apiMonthlyResetAt < monthStart) {
      monthlyCount = 0;
    }

    if (user.apiDailyLimit != null && dailyCount >= user.apiDailyLimit) {
      return { allowed: false, dailyUsed: dailyCount, dailyLimit: user.apiDailyLimit, monthlyUsed: monthlyCount, monthlyLimit: user.apiMonthlyLimit ?? null, limitType: "daily" };
    }
    if (user.apiMonthlyLimit != null && monthlyCount >= user.apiMonthlyLimit) {
      return { allowed: false, dailyUsed: dailyCount, dailyLimit: user.apiDailyLimit ?? null, monthlyUsed: monthlyCount, monthlyLimit: user.apiMonthlyLimit, limitType: "monthly" };
    }

    await db.update(users).set({
      apiDailyCount: dailyCount + 1,
      apiMonthlyCount: monthlyCount + 1,
      apiDailyResetAt: user.apiDailyResetAt && user.apiDailyResetAt >= today ? user.apiDailyResetAt : today,
      apiMonthlyResetAt: user.apiMonthlyResetAt && user.apiMonthlyResetAt >= monthStart ? user.apiMonthlyResetAt : monthStart,
    }).where(eq(users.id, id));

    return { allowed: true, dailyUsed: dailyCount + 1, dailyLimit: user.apiDailyLimit ?? null, monthlyUsed: monthlyCount + 1, monthlyLimit: user.apiMonthlyLimit ?? null, limitType: null };
  }

  async createApiLog(data: { userId: string; messages: string; response: string | null; inputTokens: number; outputTokens: number }): Promise<ApiLog> {
    const [log] = await db.insert(apiLogs).values(data).returning();
    return log;
  }

  async getApiLogs(userId: string, limit = 50): Promise<ApiLog[]> {
    return db.select().from(apiLogs).where(eq(apiLogs.userId, userId)).orderBy(desc(apiLogs.createdAt)).limit(limit);
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

  async updateConversation(id: string, data: Partial<Pick<Conversation, "title" | "model" | "updatedAt" | "isPinned" | "shareToken" | "tags" | "folderId">>): Promise<Conversation | undefined> {
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

  async createMessage(data: { conversationId: string; role: string; content: string; modelUsed?: string; attachments?: string; inputTokens?: number; outputTokens?: number; toolCalls?: string; sources?: string }): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }

  async updateMessage(id: string, data: Partial<Pick<Message, "reaction" | "content" | "isPinned">>): Promise<Message | undefined> {
    const [msg] = await db.update(messages).set(data).where(eq(messages.id, id)).returning();
    return msg;
  }

  async pinMessage(messageId: string, isPinned: boolean): Promise<Message | undefined> {
    const [msg] = await db.update(messages).set({ isPinned }).where(eq(messages.id, messageId)).returning();
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

  async updateUserSettings(userId: string, data: Partial<Pick<UserSettings, "systemPrompt" | "dailyMessageCount" | "lastMessageDate" | "fontSize" | "assistantName" | "activePromptId" | "defaultModel" | "autoScroll" | "autoTitle" | "showTokenUsage" | "customInstructions" | "notificationSound" | "responseLanguage">>): Promise<UserSettings> {
    await this.getUserSettings(userId);
    const [updated] = await db.update(userSettings).set(data).where(eq(userSettings.userId, userId)).returning();
    return updated;
  }

  async deleteAllConversations(userId: string): Promise<void> {
    await db.delete(conversations).where(eq(conversations.userId, userId));
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

  async getFolders(userId: string): Promise<Folder[]> {
    return db.select().from(folders).where(eq(folders.userId, userId)).orderBy(asc(folders.createdAt));
  }

  async createFolder(userId: string, name: string, color: string): Promise<Folder> {
    const [folder] = await db.insert(folders).values({ userId, name, color }).returning();
    return folder;
  }

  async deleteFolder(id: string): Promise<void> {
    await db.delete(folders).where(eq(folders.id, id));
  }

  async moveConversationToFolder(conversationId: string, folderId: string | null): Promise<Conversation | undefined> {
    const [conv] = await db.update(conversations).set({ folderId: folderId ?? undefined }).where(eq(conversations.id, conversationId)).returning();
    return conv;
  }

  async getAnalyticsOverview(userId: string): Promise<{ totalConversations: number; totalMessages: number; totalTokens: number; avgTokensPerMessage: number }> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const convIds = userConvs.map((c) => c.id);
    let totalMessages = 0;
    let totalTokens = 0;
    if (convIds.length > 0) {
      for (const convId of convIds) {
        const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
        totalMessages += msgs.length;
        totalTokens += msgs.reduce((s, m) => s + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
      }
    }
    return {
      totalConversations: userConvs.length,
      totalMessages,
      totalTokens,
      avgTokensPerMessage: totalMessages > 0 ? Math.round(totalTokens / totalMessages) : 0,
    };
  }

  async getAnalyticsDaily(userId: string): Promise<{ date: string; messageCount: number; tokenCount: number }[]> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const convIds = userConvs.map((c) => c.id);
    const map: Record<string, { messageCount: number; tokenCount: number }> = {};
    if (convIds.length > 0) {
      for (const convId of convIds) {
        const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
        for (const msg of msgs) {
          const date = msg.createdAt.toISOString().slice(0, 10);
          if (!map[date]) map[date] = { messageCount: 0, tokenCount: 0 };
          map[date].messageCount += 1;
          map[date].tokenCount += (msg.inputTokens ?? 0) + (msg.outputTokens ?? 0);
        }
      }
    }
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
    return sorted.map(([date, data]) => ({ date, ...data }));
  }

  async getAnalyticsModels(userId: string): Promise<{ model: string; count: number; percentage: number }[]> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const convIds = userConvs.map((c) => c.id);
    const modelCount: Record<string, number> = {};
    let total = 0;
    if (convIds.length > 0) {
      for (const convId of convIds) {
        const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
        for (const msg of msgs) {
          if (msg.modelUsed) {
            modelCount[msg.modelUsed] = (modelCount[msg.modelUsed] ?? 0) + 1;
            total++;
          }
        }
      }
    }
    return Object.entries(modelCount)
      .sort(([, a], [, b]) => b - a)
      .map(([model, count]) => ({ model, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 }));
  }

  async getAnalyticsPeakHours(userId: string): Promise<{ hour: number; count: number }[]> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const convIds = userConvs.map((c) => c.id);
    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    if (convIds.length > 0) {
      for (const convId of convIds) {
        const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
        for (const msg of msgs) {
          if (msg.role === "user") {
            const hour = new Date(msg.createdAt).getHours();
            hourMap[hour] = (hourMap[hour] ?? 0) + 1;
          }
        }
      }
    }
    return Object.entries(hourMap).map(([hour, count]) => ({ hour: Number(hour), count }));
  }

  async getAnalyticsCost(userId: string): Promise<{ estimatedCostUsd: number; byModel: { model: string; costUsd: number }[] }> {
    const MODEL_PRICING: Record<string, { input: number; output: number }> = {
      "claude-3-5-sonnet": { input: 3, output: 15 },
      "claude-3-5-haiku": { input: 0.8, output: 4 },
      "claude-3-haiku": { input: 0.25, output: 1.25 },
      "claude-3-opus": { input: 15, output: 75 },
      "claude-opus-4": { input: 15, output: 75 },
      "claude-sonnet-4": { input: 3, output: 15 },
      "llama": { input: 0.18, output: 0.18 },
      "gemini-pro": { input: 1.25, output: 5 },
      "gpt-4o": { input: 2.5, output: 10 },
      "gpt-4": { input: 30, output: 60 },
      "gpt-3.5": { input: 0.5, output: 1.5 },
      "default": { input: 3, output: 15 },
    };
    const getPricing = (model: string) => {
      const key = Object.keys(MODEL_PRICING).find((k) => model.toLowerCase().includes(k));
      return key ? MODEL_PRICING[key] : MODEL_PRICING["default"];
    };
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const convIds = userConvs.map((c) => c.id);
    const modelCost: Record<string, number> = {};
    let totalCost = 0;
    if (convIds.length > 0) {
      for (const convId of convIds) {
        const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId));
        for (const msg of msgs) {
          if (!msg.modelUsed) continue;
          const pricing = getPricing(msg.modelUsed);
          const inputCost = ((msg.inputTokens ?? 0) / 1_000_000) * pricing.input;
          const outputCost = ((msg.outputTokens ?? 0) / 1_000_000) * pricing.output;
          const msgCost = inputCost + outputCost;
          modelCost[msg.modelUsed] = (modelCost[msg.modelUsed] ?? 0) + msgCost;
          totalCost += msgCost;
        }
      }
    }
    return {
      estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
      byModel: Object.entries(modelCost)
        .sort(([, a], [, b]) => b - a)
        .map(([model, costUsd]) => ({ model, costUsd: Math.round(costUsd * 10000) / 10000 })),
    };
  }

  async getAnalyticsTopConversations(userId: string): Promise<{ id: string; title: string; totalTokens: number }[]> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId));
    const results: { id: string; title: string; totalTokens: number }[] = [];
    for (const conv of userConvs) {
      const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
      const totalTokens = msgs.reduce((s, m) => s + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
      results.push({ id: conv.id, title: conv.title, totalTokens });
    }
    return results.sort((a, b) => b.totalTokens - a.totalTokens).slice(0, 5);
  }

  async getMemories(userId: string): Promise<UserMemory[]> {
    return db.select().from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.createdAt));
  }

  async createMemory(userId: string, content: string): Promise<UserMemory> {
    const [mem] = await db.insert(userMemories).values({ userId, content }).returning();
    return mem;
  }

  async deleteMemory(id: string): Promise<void> {
    await db.delete(userMemories).where(eq(userMemories.id, id));
  }

  async getGalleryImages(userId: string): Promise<{ messageId: string; conversationId: string; conversationTitle: string; imageData: string; createdAt: Date }[]> {
    const userConvs = await db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.createdAt));
    const results: { messageId: string; conversationId: string; conversationTitle: string; imageData: string; createdAt: Date }[] = [];
    for (const conv of userConvs) {
      const msgs = await db.select().from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt));
      for (const msg of msgs) {
        if (msg.content.includes("data:image/")) {
          const match = msg.content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
          if (match) {
            results.push({ messageId: msg.id, conversationId: conv.id, conversationTitle: conv.title, imageData: match[1], createdAt: msg.createdAt });
          }
        }
      }
    }
    return results.slice(0, 100);
  }

  async getActiveBroadcast(): Promise<Broadcast | undefined> {
    const [broadcast] = await db.select().from(broadcasts)
      .where(and(
        eq(broadcasts.isActive, true),
        or(
          isNull(broadcasts.expiresAt),
          gte(broadcasts.expiresAt, new Date())
        )
      ))
      .orderBy(desc(broadcasts.createdAt))
      .limit(1);
    return broadcast;
  }

  async createBroadcast(data: InsertBroadcast): Promise<Broadcast> {
    const [broadcast] = await db.insert(broadcasts).values(data).returning();
    return broadcast;
  }

  async getAllBroadcasts(): Promise<Broadcast[]> {
    return db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt));
  }

  async getProviders(): Promise<AiProvider[]> {
    return db.select().from(aiProviders).orderBy(asc(aiProviders.priority), asc(aiProviders.createdAt));
  }

  async getActiveProviders(): Promise<AiProvider[]> {
    return db.select().from(aiProviders)
      .where(eq(aiProviders.isEnabled, true))
      .orderBy(asc(aiProviders.priority), asc(aiProviders.createdAt));
  }

  async getProvider(id: string): Promise<AiProvider | undefined> {
    const [p] = await db.select().from(aiProviders).where(eq(aiProviders.id, id));
    return p;
  }

  async createProvider(data: InsertAiProvider): Promise<AiProvider> {
    const [p] = await db.insert(aiProviders).values(data).returning();
    return p;
  }

  async updateProvider(id: string, data: Partial<InsertAiProvider>): Promise<AiProvider | undefined> {
    const [p] = await db.update(aiProviders).set(data).where(eq(aiProviders.id, id)).returning();
    return p;
  }

  async deleteProvider(id: string): Promise<void> {
    await db.delete(aiProviders).where(eq(aiProviders.id, id));
  }

  async setActiveProvider(id: string): Promise<void> {
    await db.update(aiProviders).set({ isActive: false });
    await db.update(aiProviders).set({ isActive: true }).where(eq(aiProviders.id, id));
  }

  async reorderProviders(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      await db.update(aiProviders).set({ priority: i }).where(eq(aiProviders.id, ids[i]));
    }
  }

  async getStudyNotes(userId: string): Promise<StudyNote[]> {
    return db.select().from(studyNotes).where(eq(studyNotes.userId, userId)).orderBy(desc(studyNotes.updatedAt));
  }

  async getStudyNote(id: string): Promise<StudyNote | undefined> {
    const [note] = await db.select().from(studyNotes).where(eq(studyNotes.id, id));
    return note;
  }

  async createStudyNote(userId: string, title: string, content: string): Promise<StudyNote> {
    const [note] = await db.insert(studyNotes).values({ userId, title, content }).returning();
    return note;
  }

  async updateStudyNote(id: string, data: Partial<Pick<StudyNote, "title" | "content">>): Promise<StudyNote | undefined> {
    const [note] = await db.update(studyNotes).set({ ...data, updatedAt: new Date() }).where(eq(studyNotes.id, id)).returning();
    return note;
  }

  async deleteStudyNote(id: string): Promise<void> {
    await db.delete(studyNotes).where(eq(studyNotes.id, id));
  }

  async getStudyOutputs(userId: string, type?: string): Promise<StudyOutput[]> {
    const conditions = type
      ? and(eq(studyOutputs.userId, userId), eq(studyOutputs.type, type))
      : eq(studyOutputs.userId, userId);
    return db.select().from(studyOutputs).where(conditions).orderBy(desc(studyOutputs.createdAt));
  }

  async createStudyOutput(data: { noteId?: string; userId: string; type: string; title: string; data: unknown }): Promise<StudyOutput> {
    const [output] = await db.insert(studyOutputs).values({
      noteId: data.noteId ?? null,
      userId: data.userId,
      type: data.type,
      title: data.title,
      data: data.data as Record<string, unknown>,
    }).returning();
    return output;
  }

  async deleteStudyOutput(id: string): Promise<void> {
    await db.delete(studyOutputs).where(eq(studyOutputs.id, id));
  }

  async getKnowledgeBases(userId: string): Promise<KnowledgeBase[]> {
    return db.select().from(knowledgeBases).where(eq(knowledgeBases.userId, userId)).orderBy(desc(knowledgeBases.createdAt));
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase | undefined> {
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
    return kb;
  }

  async getKnowledgeBaseByToken(token: string): Promise<KnowledgeBase | undefined> {
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.shareToken, token));
    return kb;
  }

  async createKnowledgeBase(userId: string, name: string, description: string): Promise<KnowledgeBase> {
    const [kb] = await db.insert(knowledgeBases).values({ userId, name, description }).returning();
    return kb;
  }

  async updateKnowledgeBase(id: string, data: Partial<Pick<KnowledgeBase, "name" | "description" | "isPublic" | "shareToken">>): Promise<KnowledgeBase | undefined> {
    const [kb] = await db.update(knowledgeBases).set(data).where(eq(knowledgeBases.id, id)).returning();
    return kb;
  }

  async deleteKnowledgeBase(id: string): Promise<void> {
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
  }

  async getKbDocuments(kbId: string): Promise<KbDocument[]> {
    return db.select().from(kbDocuments).where(eq(kbDocuments.kbId, kbId)).orderBy(desc(kbDocuments.createdAt));
  }

  async getKbDocument(id: string): Promise<KbDocument | undefined> {
    const [doc] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, id));
    return doc;
  }

  async createKbDocument(data: { kbId: string; userId: string; name: string; content: string; chunkCount: number }): Promise<KbDocument> {
    const [doc] = await db.insert(kbDocuments).values(data).returning();
    return doc;
  }

  async deleteKbDocument(id: string): Promise<void> {
    await db.delete(kbDocuments).where(eq(kbDocuments.id, id));
  }

  async createKbChunks(chunks: { docId: string; kbId: string; content: string; embedding: number[]; chunkIndex: number }[]): Promise<void> {
    if (chunks.length === 0) return;
    await db.insert(kbChunks).values(chunks);
  }

  async getKbChunks(kbId: string): Promise<KbChunk[]> {
    return db.select().from(kbChunks).where(eq(kbChunks.kbId, kbId));
  }

  async deleteKbChunksByDoc(docId: string): Promise<void> {
    await db.delete(kbChunks).where(eq(kbChunks.docId, docId));
  }
}

export const storage = new DatabaseStorage();

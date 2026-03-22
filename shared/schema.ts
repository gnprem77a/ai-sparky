import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  plan: text("plan").notNull().default("free"),
  planExpiresAt: timestamp("plan_expires_at"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  apiKey: text("api_key"),
  apiEnabled: boolean("api_enabled").notNull().default(false),
  email: text("email").unique(),
  apiDailyLimit: integer("api_daily_limit"),
  apiDailyCount: integer("api_daily_count").notNull().default(0),
  apiDailyResetAt: timestamp("api_daily_reset_at"),
  apiMonthlyLimit: integer("api_monthly_limit"),
  apiMonthlyCount: integer("api_monthly_count").notNull().default(0),
  apiMonthlyResetAt: timestamp("api_monthly_reset_at"),
  apiWebhookUrl: text("api_webhook_url"),
  apiRateLimitPerMin: integer("api_rate_limit_per_min"),
  isFlagged: boolean("is_flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  monthlyOutputTokens: integer("monthly_output_tokens").notNull().default(0),
  monthlyTokensResetAt: timestamp("monthly_tokens_reset_at"),
  apiBalance: real("api_balance").notNull().default(0),
  apiKeyHash: text("api_key_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  model: text("model").notNull().default("auto"),
  isPinned: boolean("is_pinned").notNull().default(false),
  shareToken: varchar("share_token"),
  tags: text("tags").array().notNull().default(sql`'{}'`),
  folderId: varchar("folder_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("default"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull().default(""),
  modelUsed: text("model_used"),
  attachments: text("attachments"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  reaction: text("reaction"),
  isPinned: boolean("is_pinned").notNull().default(false),
  toolCalls: text("tool_calls"),
  sources: text("sources"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userSettings = pgTable("user_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  systemPrompt: text("system_prompt").notNull().default(""),
  dailyMessageCount: integer("daily_message_count").notNull().default(0),
  lastMessageDate: text("last_message_date"),
  fontSize: text("font_size").notNull().default("normal"),
  assistantName: text("assistant_name").notNull().default("Assistant"),
  activePromptId: varchar("active_prompt_id"),
  defaultModel: text("default_model").notNull().default("auto"),
  autoScroll: boolean("auto_scroll").notNull().default(true),
  autoTitle: boolean("auto_title").notNull().default(true),
  showTokenUsage: boolean("show_token_usage").notNull().default(false),
  customInstructions: text("custom_instructions").notNull().default(""),
  notificationSound: boolean("notification_sound").notNull().default(false),
  responseLanguage: text("response_language").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  personaAvatarLetter: text("persona_avatar_letter").notNull().default("A"),
  personaPersonality: text("persona_personality").notNull().default(""),
  notifyBroadcast: boolean("notify_broadcast").notNull().default(true),
  notifyWeeklyDigest: boolean("notify_weekly_digest").notNull().default(false),
  notifySecurityAlerts: boolean("notify_security_alerts").notNull().default(true),
});

export const savedPrompts = pgTable("saved_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userMemories = pgTable("user_memories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const aiProviders = pgTable("ai_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull().default("openai"),
  apiUrl: text("api_url"),
  apiKey: text("api_key"),
  modelName: text("model_name").notNull().default(""),
  headers: text("headers"),
  httpMethod: text("http_method").notNull().default("POST"),
  authStyle: text("auth_style").notNull().default("bearer"),
  authHeaderName: text("auth_header_name"),
  streamMode: text("stream_mode").notNull().default("none"),
  isActive: boolean("is_active").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  bodyTemplate: text("body_template"),
  responsePath: text("response_path"),
  inputPricePerMillion: real("input_price_per_million"),
  outputPricePerMillion: real("output_price_per_million"),
  maxOutputTokens: integer("max_output_tokens"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const studyNotes = pgTable("study_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Untitled Note"),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const studyOutputs = pgTable("study_outputs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteId: varchar("note_id"),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(), // "summary" | "quiz" | "flashcards"
  title: text("title").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const knowledgeBases = pgTable("knowledge_bases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  shareToken: varchar("share_token"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const kbDocuments = pgTable("kb_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  kbId: varchar("kb_id").notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  chunkCount: integer("chunk_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const kbChunks = pgTable("kb_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: varchar("doc_id").notNull().references(() => kbDocuments.id, { onDelete: "cascade" }),
  kbId: varchar("kb_id").notNull(),
  content: text("content").notNull(),
  embedding: real("embedding").array(),
  chunkIndex: integer("chunk_index").notNull(),
});

export const apiLogs = pgTable("api_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  apiKeyId: text("api_key_id"),
  messages: text("messages").notNull(),
  response: text("response"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  modelUsed: text("model_used"),
  endpoint: text("endpoint"),
  costDeducted: real("cost_deducted"),
  inputCost: real("input_cost"),
  outputCost: real("output_cost"),
  status: text("status").notNull().default("success"),
  success: boolean("success").notNull().default(true),
  requestId: text("request_id"),
  failReason: text("fail_reason"),
  providerResponseId: text("provider_response_id"),
  balanceBefore: real("balance_before"),
  balanceAfter: real("balance_after"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});
export type ApiLog = typeof apiLogs.$inferSelect;

export const broadcasts = pgTable("broadcasts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
});

export const imageGenConfig = pgTable("image_gen_config", {
  id: integer("id").primaryKey().default(1),
  providerType: text("provider_type").notNull().default("fal"),
  apiUrl: text("api_url"),
  apiKey: text("api_key"),
  modelName: text("model_name"),
  authStyle: text("auth_style").notNull().default("bearer"),
  apiVersion: text("api_version"),
  isEnabled: boolean("is_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type ImageGenConfig = typeof imageGenConfig.$inferSelect;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;

export const emailLogs = pgTable("email_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  templateType: text("template_type").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type EmailLog = typeof emailLogs.$inferSelect;

export const smtpConfig = pgTable("smtp_config", {
  id: integer("id").primaryKey().default(1),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(465),
  username: text("username").notNull().default(""),
  passwordEnc: text("password_enc").notNull().default(""),
  fromEmail: text("from_email").notNull().default(""),
  fromName: text("from_name").notNull().default("AI Sparky"),
  secure: boolean("secure").notNull().default(true),
  isEnabled: boolean("is_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type SmtpConfig = typeof smtpConfig.$inferSelect;

export const insertUserSchema = createInsertSchema(users)
  .pick({ password: true })
  .extend({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

export const insertBroadcastSchema = createInsertSchema(broadcasts).omit({
  id: true,
  createdAt: true,
});

export const insertAiProviderSchema = createInsertSchema(aiProviders).omit({ id: true, createdAt: true });
export type InsertAiProvider = z.infer<typeof insertAiProviderSchema>;
export type AiProvider = typeof aiProviders.$inferSelect;

export const insertStudyNoteSchema = createInsertSchema(studyNotes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStudyOutputSchema = createInsertSchema(studyOutputs).omit({ id: true, createdAt: true });

export type InsertUser = {
  username: string;
  email: string | null;
  password: string;
};
export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type SavedPrompt = typeof savedPrompts.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type UserMemory = typeof userMemories.$inferSelect;
export type Broadcast = typeof broadcasts.$inferSelect;
export type InsertBroadcast = z.infer<typeof insertBroadcastSchema>;
export type StudyNote = typeof studyNotes.$inferSelect;
export type StudyOutput = typeof studyOutputs.$inferSelect;
export type InsertStudyNote = z.infer<typeof insertStudyNoteSchema>;
export type InsertStudyOutput = z.infer<typeof insertStudyOutputSchema>;

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases).omit({ id: true, createdAt: true });
export const insertKbDocumentSchema = createInsertSchema(kbDocuments).omit({ id: true, createdAt: true });
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type KbDocument = typeof kbDocuments.$inferSelect;
export type KbChunk = typeof kbChunks.$inferSelect;
export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type InsertKbDocument = z.infer<typeof insertKbDocumentSchema>;

export const featureEvents = pgTable("feature_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feature: text("feature").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type FeatureEvent = typeof featureEvents.$inferSelect;

export const globalTrial = pgTable("global_trial", {
  id: integer("id").primaryKey().default(1),
  isActive: boolean("is_active").notNull().default(false),
  durationDays: integer("duration_days").notNull().default(7),
  newUserEnrollUntil: timestamp("new_user_enroll_until"),
  appliedAt: timestamp("applied_at"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export type GlobalTrial = typeof globalTrial.$inferSelect;

export const redeemCodes = pgTable("redeem_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  label: text("label").notNull().default(""),
  planDays: integer("plan_days").notNull().default(30),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type RedeemCode = typeof redeemCodes.$inferSelect;

export const codeRedemptions = pgTable("code_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codeId: varchar("code_id").notNull().references(() => redeemCodes.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  redeemedAt: timestamp("redeemed_at").notNull().default(sql`now()`),
  planExpiresAt: timestamp("plan_expires_at").notNull(),
});

export type CodeRedemption = typeof codeRedemptions.$inferSelect;

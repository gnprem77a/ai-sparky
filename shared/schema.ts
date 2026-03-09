import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type SavedPrompt = typeof savedPrompts.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type UserMemory = typeof userMemories.$inferSelect;

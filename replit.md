# AI Sparky (aisparky.dev)

A premium personal AI chat application.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js (Node.js)
- **Bundler**: Vite (dev) / esbuild (prod)
- **AI**: Universal provider system — default Bluesminds (api.bluesminds.com), supports OpenAI, Anthropic, Azure, Gemini, AWS Bedrock, Custom
- **Database**: PostgreSQL (Replit) via Drizzle ORM
- **Auth**: Session-based (express-session + connect-pg-simple + bcrypt)
- **Chat Storage**: PostgreSQL (cloud, persists across devices)
- **Math**: remark-math + rehype-katex (LaTeX rendering)
- **Diagrams**: mermaid (Mermaid diagram rendering)

## Project Structure

```
client/src/
  components/
    AppSidebar.tsx      - Sidebar: full-text search, tag filter bar, pin, rename, share, tags popover
    ChatMessage.tsx     - Messages with markdown/LaTeX/Mermaid/reactions/token badge/stopped indicator
    ChatInput.tsx       - Bottom input with attach menu, prompt library, model selector, voice input (Web Speech API), waveform panel with timer
    ModelSelector.tsx   - Model options with proOnly flags
    CodeBlock.tsx       - Lazy-loaded syntax highlighter (Prism)
    SettingsModal.tsx   - 3-tab modal: System Prompt, Appearance (fontSize/name), Account
    PromptLibrary.tsx   - Saved prompt library popover (CRUD + insert into input)
  pages/
    ChatPage.tsx        - Main chat: streaming, abort+partial save, typing cursor, elapsed timer, suggestions
    AuthPage.tsx        - Login / Sign up page
    AdminPage.tsx       - Admin dashboard: user/plan management + token usage analytics
    SharedConversationPage.tsx - Public read-only view (/share/:token)
  hooks/
    use-theme.ts        - Dark/light mode toggle
    use-auth.ts         - Auth state (me, login, register, logout) with plan info
  lib/
    chat-storage.ts     - Type definitions, utilities, export helpers
shared/
  models.ts             - Single source of truth for model registry
  schema.ts             - Drizzle schema (users, conversations, messages, userSettings, savedPrompts, userMemories, passwordResetTokens)
server/
  db.ts                 - Drizzle + pg pool
  storage.ts            - DatabaseStorage (CRUD for all entities + searchMessages + provider CRUD)
  routes.ts             - Auth + conversation + settings + admin routes + /api/chat (SSE) + /api/admin/providers
  index.ts              - Express setup with session middleware
  lib/
    providers/
      types.ts          - Interfaces: ProviderAdapter, ProviderConfig, StreamOptions, TOOL_DEFINITIONS_OPENAI
      openai-compat.ts  - OpenAI-compatible adapter (OpenAI, Azure, Gemini, Bluesminds)
      anthropic.ts      - Anthropic native Messages API adapter
      bedrock.ts        - AWS Bedrock Converse API adapter (SigV4 signing)
      custom.ts         - Custom HTTP provider adapter (body template + response path)
      index.ts          - Registry: buildAdapter(), testProvider(), streamWithFallback()
```

## Features

### Core
- **Auth**: Username/password signup and login with persistent sessions (30-day cookie)
- **Cloud chat history**: Conversations and messages stored in PostgreSQL
- **Free/Pro plan enforcement**: Free = Fast model only + 20 messages/day; Pro = all models + unlimited
- **Streaming responses**: AWS Bedrock via SSE with 50ms buffer; abort mid-stream
- **Multi-model routing**: Auto/Balanced/Powerful/Creative/Fast modes
- **Markdown rendering**: Syntax-highlighted code blocks, copy button, tables, lists

### Premium UX
- **LaTeX math**: remark-math + rehype-katex for inline/block math rendering
- **Mermaid diagrams**: auto-detect ```mermaid code blocks, render inline with mermaid.js
- **Typewriter cursor**: blinking `▊` cursor appended while streaming
- **Thinking indicator**: animated 3-dot bounce before first token arrives
- **Elapsed timer**: shows streaming duration (e.g. "3.2s") below message
- **Token badge**: hover any message to see input/output token counts
- **Message reactions**: thumbs up/down on assistant messages, persisted in DB
- **Abort + partial save**: stopping generation saves the partial response with a "⚠ Stopped" badge
- **Suggestion grid**: empty state shows 6 prompt suggestion cards (Code/Writing/Analysis/etc.)

### Sidebar
- **Full-text search**: searches message content via `/api/search`, shows conversation + snippet
- **Title search**: filters sidebar by title for quick 3+ char queries
- **Conversation tags**: tag icon per conversation → popover to add/remove tags
- **Tag filter bar**: appears when any tags exist, click to filter conversations
- **Pin conversations**: pin important chats to the top
- **Share**: generate public share link per conversation
- **Rename / Delete**: inline rename on double-click or via action row

### Settings (full modal with vertical tab nav)
- **System Prompt tab**: textarea for global system prompt + dropdown to pick active saved prompt
- **Appearance tab**: font size (Compact/Normal/Large), custom assistant name, **language picker** (EN/ES/FR/AR)
- **Behavior tab**: default model, auto-scroll, auto-title, show token usage toggles
- **Account tab**: change password
- **Shortcuts, Memory, Data tabs**: additional settings

### 15 Premium Features Added
- **Text-to-Speech (T001)**: Speaker button on assistant messages; Web Speech API; pulsing indicator while speaking
- **Voice Input (T001)**: Mic button in chat input; SpeechRecognition API; red pulsing while recording
- **Pinned Messages (T002)**: Pin/unpin button on messages; gold badge; slide-out panel in chat header showing all pinned messages with scroll-to capability
- **Conversation Folders (T003)**: Create/delete folders; move conversations to folders; collapsible folder tree in sidebar with color dots
- **Usage Analytics (T004)**: `/analytics` page with stat cards (Total Conversations, Messages, Tokens, Avg Length), bar chart (messages/day), pie chart (model usage), line chart (tokens over time)
- **Command Palette (T005)**: Cmd+K shortcut + header button; fuzzy search across conversations; keyboard navigation; actions (New Chat, Settings, Analytics, Admin)
- **Canvas/Artifact Mode (T006)**: HTML/SVG code blocks get Code/Preview tabs; live iframe preview with sandbox; Refresh + Open in new tab buttons
- **Split View (T007)**: Toggle two conversation panels side-by-side; secondary panel has independent conversation selector and full chat capability; persisted in localStorage
- **Multi-Language UI (T008)**: EN/ES/FR/AR translations; `useLanguage()` hook with LanguageContext; Arabic triggers RTL layout; applied to ChatInput, AuthPage, ChatPage empty state, AppSidebar, SettingsModal
- **Plugin/Tool System**: SSE streaming tool calls (web_search, calculator, get_weather, fetch_url); ToolCallsDisplay UI shows tool invocations inline; tools injected as system prompt definitions
- **Per-fact Memory System**: `user_memories` DB table; per-fact list in Settings Memory tab with Add/Delete; memories injected into every conversation system prompt
- **Image Gallery**: `/gallery` page shows all AI-generated images in a responsive grid; download + jump-to-conversation buttons; linked from sidebar
- **PDF Chat**: Upload PDF → server extracts text via pdf-parse → extracted content sent to AI as context with page count badge
- **More Tools**: `get_weather(location)` via wttr.in free API; `fetch_url(url)` with HTML stripping (8000 char limit)
- **Mobile Responsive**: Non-essential header buttons hidden on small screens (sm: breakpoints); sidebar uses shadcn Sheet for mobile drawer
- **Export Dropdown**: Single FileDown icon button in header opens a dropdown with "Download Markdown" and "Export as PDF" options; visible on all screen sizes
- **Custom Chat Themes**: Settings → Appearance tab has Color Mode (Light/Dark toggle) + Accent Color picker with 7 themes (Default, Ocean, Sunset, Forest, Midnight, Rose, Hacker); theme classes applied to `document.documentElement`; persisted in `localStorage("color-theme")`; initialized in index.html IIFE before React loads
- **Conversation Summary**: Sparkles icon button in header; calls `POST /api/summarize` with current messages; returns 3–5 bullet-point TL;DR from Claude Haiku (InvokeModelCommand, non-streaming); displayed in a Dialog modal

### Admin
- **User management**: list users, change plans (Free/Pro with duration)
- **Token usage**: per-user input/output token totals + estimated cost breakdown
- **AI Provider Engine**: fully dynamic universal provider management
  - Add/edit/delete/toggle unlimited providers
  - Per-provider: Name, Type, Base URL, API Key, Model Name, HTTP Method (POST/GET/PUT/PATCH/DELETE), Headers JSON, Body Template, Response Path, Priority, Enable toggle
  - Provider types: OpenAI, Anthropic, Azure OpenAI, Google Gemini, AWS Bedrock, Custom, Bluesminds
  - Custom providers: body template supports `{{prompt}}`, `{{messages}}`, `{{model}}`, `{{systemPrompt}}`, `{{maxTokens}}`; response path uses dot notation
  - Test Connection button: shows "Connected" / "Invalid Key" (401/403) / "Connection Failed"
  - Fallback chain: providers tried in priority order; built-in Bluesminds is always last resort
  - `generateText` and streaming both route through proper adapters (respects custom body/response path)
  - Enhanced fallback: 429 rate-limit detection; `onFallback` callback emits SSE `providerFallback` event; ChatPage shows toast with provider name + reason

## Database Tables

- `users` — id, username, password, isAdmin, plan, planExpiresAt, createdAt, apiKey (text), apiEnabled (boolean) — API access fields
- `conversations` — id, userId, title, model, isPinned, shareToken, folderId, createdAt, updatedAt, tags (text[])
- `messages` — id, conversationId, role, content, modelUsed, attachments (JSON), inputTokens, outputTokens, reaction, stopped, isPinned, createdAt
- `user_settings` — userId, systemPrompt, dailyMessageCount, lastMessageDate, fontSize, assistantName, activePromptId, contactEmail (admin-set contact for Pro upgrade inquiries)
- `saved_prompts` — id, userId, name, content, createdAt
- `folders` — id, userId, name, color, createdAt
- `session` — managed by connect-pg-simple
- `ai_providers` — id, name, providerType, apiUrl, apiKey, modelName, headers, httpMethod, authStyle, authHeaderName, streamMode, isActive, isEnabled, priority, bodyTemplate, responsePath, createdAt
- `knowledge_bases` — id, userId, name, description, createdAt
- `kb_documents` — id, kbId, name, content, createdAt
- `kb_chunks` — id, docId, kbId, content, embedding (real[]), createdAt

**Note**: Do NOT run `npm run db:push` directly. Use direct SQL for schema changes.

## Setup

### Environment Variables

```
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
SESSION_SECRET=your_session_secret
DATABASE_URL=<set automatically by Replit>
```

## Bedrock Models

| UI Name    | Model ID                                          | Plan  |
|------------|---------------------------------------------------|-------|
| Balanced   | anthropic.claude-3-5-sonnet-20241022-v2:0         | Pro   |
| Powerful   | anthropic.claude-opus-4-5-20251101-v1:0           | Pro   |
| Creative   | meta.llama3-1-70b-instruct-v1:0                   | Pro   |
| Fast       | anthropic.claude-3-haiku-20240307-v1:0            | Free  |

## Architecture Notes

- AWS credentials are NEVER sent to the frontend
- All Bedrock calls happen server-side via `/api/chat` (requires auth)
- Free plan enforcement: model overridden to "fast", daily count tracked in user_settings
- Active system prompt: if `activePromptId` is set in user_settings, its content is used; else falls back to `systemPrompt` text field
- Last 6 messages sent as context to Bedrock API
- SSE stream emits `{ done, inputTokens, outputTokens }` at end for token tracking
- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in PostgreSQL via connect-pg-simple
- First registered user automatically becomes admin

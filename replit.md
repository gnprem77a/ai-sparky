# AI Chat

A modern, personal AI chat application powered by Claude via Amazon Bedrock.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js (Node.js)
- **Bundler**: Vite (dev) / esbuild (prod)
- **AI**: AWS Bedrock (Anthropic Claude + Meta Llama models)
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
    ChatInput.tsx       - Bottom input with attach menu, prompt library, model selector
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
  schema.ts             - Drizzle schema (users, conversations, messages, userSettings, savedPrompts)
server/
  db.ts                 - Drizzle + pg pool
  storage.ts            - DatabaseStorage (CRUD for all entities + searchMessages)
  routes.ts             - Auth + conversation + settings + admin routes + /api/chat (SSE)
  index.ts              - Express setup with session middleware
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

### Settings (3-tab modal)
- **System Prompt tab**: textarea for global system prompt + dropdown to pick active saved prompt
- **Appearance tab**: font size (Compact/Normal/Large), custom assistant name
- **Account tab**: change password

### Admin
- **User management**: list users, change plans (Free/Pro with duration)
- **Token usage**: per-user input/output token totals + estimated cost breakdown

## Database Tables

- `users` — id, username, password, isAdmin, plan, planExpiresAt, createdAt
- `conversations` — id, userId, title, model, isPinned, shareToken, createdAt, updatedAt, tags (text[])
- `messages` — id, conversationId, role, content, modelUsed, attachments (JSON), inputTokens, outputTokens, reaction, stopped, createdAt
- `user_settings` — userId, systemPrompt, dailyMessageCount, lastMessageDate, fontSize, assistantName, activePromptId
- `saved_prompts` — id, userId, name, content, createdAt
- `session` — managed by connect-pg-simple

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

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

## Project Structure

```
client/src/
  components/
    AppSidebar.tsx      - Left sidebar with conversation history + search
    ChatMessage.tsx     - Individual message with markdown/code rendering (React.memo)
    ChatInput.tsx       - Bottom input with attach menu, model selector, plan enforcement
    ModelSelector.tsx   - Model options with proOnly flags
    CodeBlock.tsx       - Lazy-loaded syntax highlighter (Prism)
    SettingsModal.tsx   - System prompt + change password modal
  pages/
    ChatPage.tsx        - Main chat interface (cloud storage, keyboard shortcuts, export)
    AuthPage.tsx        - Login / Sign up page
    AdminPage.tsx       - Admin dashboard with user + plan management
  hooks/
    use-theme.ts        - Dark/light mode toggle
    use-auth.ts         - Auth state (me, login, register, logout) with plan info
  lib/
    chat-storage.ts     - Type definitions, utilities, export helpers
shared/
  models.ts             - Single source of truth for model registry
  schema.ts             - Drizzle schema (users, conversations, messages, userSettings)
server/
  db.ts                 - Drizzle + pg pool
  storage.ts            - DatabaseStorage (users, conversations, messages, settings)
  routes.ts             - Auth + conversation + settings + admin routes + /api/chat
  index.ts              - Express setup with session middleware
```

## Features

- **Auth**: Username/password signup and login with persistent sessions (30-day cookie)
- **Cloud chat history**: Conversations and messages stored in PostgreSQL (persist across devices/browsers)
- **Free/Pro plan enforcement**: Free = Fast model only + 20 messages/day; Pro = all models + unlimited
- **Model locking**: Pro-only models are visually locked with a "Pro" badge in the model selector for free users
- **Custom system prompt**: Users can set a global instruction prepended to all conversations (saved to DB)
- **Change password**: Account settings with current/new/confirm password fields
- **Export conversation**: Download active conversation as Markdown file
- **Keyboard shortcuts**: Ctrl+K (new chat), Escape (stop streaming)
- **Conversation search**: Search conversations by title in the sidebar
- **Admin dashboard**: User management, plan management (Free/Pro with duration options)
- Streaming responses via AWS Bedrock (Claude Sonnet, Opus, Haiku; Meta Llama)
- Multi-model routing: Auto/Balanced/Powerful/Creative/Fast modes
- Markdown rendering with lazy-loaded syntax-highlighted code blocks + copy button
- Dark mode by default with toggle
- Responsive layout (mobile + desktop)
- Stop generation mid-stream; abort on conversation switch
- 50ms stream buffer for smooth rendering
- React.memo on ChatMessage to prevent unnecessary re-renders

## Database Tables

- `users` — id, username, password, isAdmin, plan, planExpiresAt, createdAt
- `conversations` — id, userId, title, model, createdAt, updatedAt
- `messages` — id, conversationId, role, content, modelUsed, attachments (JSON), createdAt
- `user_settings` — userId, systemPrompt, dailyMessageCount, lastMessageDate
- `session` — managed by connect-pg-simple

**Note**: Do NOT run `npm run db:push` directly as it may prompt about the session table. Use direct SQL for schema changes.

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
| Auto       | (routes to best model automatically)              | Pro   |
| Balanced   | anthropic.claude-3-5-sonnet-20241022-v2:0         | Pro   |
| Powerful   | anthropic.claude-opus-4-5-20251101-v1:0           | Pro   |
| Creative   | meta.llama3-1-70b-instruct-v1:0                   | Pro   |
| Fast       | anthropic.claude-3-haiku-20240307-v1:0            | Free  |

## Architecture Notes

- AWS credentials are NEVER sent to the frontend
- All Bedrock calls happen server-side via `/api/chat` (requires auth)
- Free plan enforcement: model overridden to "fast", daily count tracked in user_settings
- System prompt fetched from user_settings on backend and prepended to Bedrock API calls
- Last 6 messages are sent as context to the API
- Server-Sent Events (SSE) used for streaming responses
- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in PostgreSQL via connect-pg-simple
- First registered user automatically becomes admin

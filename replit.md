# AI Chat

A modern, personal AI chat application powered by Claude via Amazon Bedrock.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js (Node.js)
- **Bundler**: Vite (dev) / esbuild (prod)
- **AI**: AWS Bedrock (Anthropic Claude + Meta Llama models)
- **Database**: PostgreSQL (Replit) via Drizzle ORM
- **Auth**: Session-based (express-session + connect-pg-simple + bcrypt)
- **Chat Storage**: Browser localStorage

## Project Structure

```
client/src/
  components/
    AppSidebar.tsx      - Left sidebar with conversation history
    ChatMessage.tsx     - Individual message with markdown/code rendering (React.memo)
    ChatInput.tsx       - Bottom input with attach menu and model selector
    ModelSelector.tsx   - Dropdown to switch between AI models
    CodeBlock.tsx       - Lazy-loaded syntax highlighter (Prism)
  pages/
    ChatPage.tsx        - Main chat interface
    AuthPage.tsx        - Login / Sign up page
  hooks/
    use-theme.ts        - Dark/light mode toggle
    use-auth.ts         - Auth state (me, login, register, logout)
  lib/
    chat-storage.ts     - localStorage utilities for chat history
    models.ts           - Re-exports from shared/models.ts
shared/
  models.ts             - Single source of truth for model registry
  schema.ts             - Drizzle schema (users table)
server/
  db.ts                 - Drizzle + pg pool
  storage.ts            - DatabaseStorage (PostgreSQL)
  routes.ts             - Auth routes + /api/chat (Bedrock streaming)
  index.ts              - Express setup with session middleware
```

## Features

- **Auth**: Username/password signup and login with persistent sessions (30-day cookie)
- Streaming responses via AWS Bedrock (Claude Sonnet, Opus, Haiku; Meta Llama)
- Multi-model routing: Auto/Balanced/Powerful/Creative/Fast modes
- Markdown rendering with lazy-loaded syntax-highlighted code blocks + copy button
- Chat history stored in localStorage
- Dark mode by default with toggle
- Responsive layout (mobile + desktop)
- Scroll-to-bottom sentinel for smooth auto-scroll
- Stop generation mid-stream; abort on conversation switch
- 50ms stream buffer for smooth rendering
- React.memo on ChatMessage to prevent unnecessary re-renders during streaming
- Code-split ChatPage and CodeBlock for faster initial load

## Setup

### Environment Variables

```
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
SESSION_SECRET=your_session_secret
DATABASE_URL=<set automatically by Replit>
```

### Run Locally

```bash
npm install
npm run db:push
npm run dev
```

## Bedrock Models

| UI Name    | Model ID                                          |
|------------|---------------------------------------------------|
| Balanced   | anthropic.claude-3-5-sonnet-20241022-v2:0         |
| Powerful   | anthropic.claude-opus-4-5-20251101-v1:0           |
| Creative   | meta.llama3-1-70b-instruct-v1:0                   |
| Fast       | anthropic.claude-3-haiku-20240307-v1:0            |

## Architecture Notes

- AWS credentials are NEVER sent to the frontend
- All Bedrock calls happen server-side via `/api/chat` (requires auth)
- Last 6 messages are sent as context to the API
- Server-Sent Events (SSE) used for streaming responses
- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in PostgreSQL via connect-pg-simple

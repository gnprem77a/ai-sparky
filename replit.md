# AI Chat

A modern, personal AI chat application powered by Claude via Amazon Bedrock.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Express.js (Node.js)
- **Bundler**: Vite (dev) / esbuild (prod)
- **AI**: AWS Bedrock (Anthropic Claude models)
- **Storage**: Browser localStorage for chat history

## Project Structure

```
client/src/
  components/
    AppSidebar.tsx      - Left sidebar with conversation history
    ChatMessage.tsx     - Individual message with markdown/code rendering
    ChatInput.tsx       - Bottom input with auto-resize
    ModelSelector.tsx   - Dropdown to switch between Claude models
  pages/
    ChatPage.tsx        - Main chat interface
  hooks/
    use-theme.ts        - Dark/light mode toggle
  lib/
    chat-storage.ts     - localStorage utilities for chat history
server/
  routes.ts             - /api/chat endpoint (Bedrock streaming)
```

## Features

- Streaming responses from Claude Sonnet and Claude Opus via AWS Bedrock
- Markdown rendering with syntax-highlighted code blocks + copy button
- Chat history stored in localStorage with grouped sidebar
- Dark mode by default with toggle
- Responsive layout (mobile + desktop)
- Auto-scroll to latest message
- Stop generation mid-stream
- Suggestion prompts on empty state
- Model selector (Claude Sonnet / Claude Opus)

## Setup

### Environment Variables

Add these to your environment secrets:

```
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
AWS_REGION=us-east-1
```

### Run Locally

```bash
npm install
npm run dev
```

## Bedrock Models

| UI Name        | Model ID                                        |
|----------------|-------------------------------------------------|
| Claude Sonnet  | anthropic.claude-3-5-sonnet-20241022-v2:0       |
| Claude Opus    | anthropic.claude-3-opus-20240229-v1:0           |

## Architecture Notes

- AWS credentials are NEVER sent to the frontend
- All Bedrock calls happen server-side via `/api/chat`
- Last 5 messages are sent as context to the API
- Server-Sent Events (SSE) used for streaming responses

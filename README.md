# Chat AI Platform

A full-stack real-time chat platform with a built-in AI assistant,
built with **Next.js**, **NestJS**, **Prisma**, **PostgreSQL**, and **Socket.IO**.

This app includes:

- JWT authentication
- Channels & Direct Messages
- Realtime messaging
- Full presence (online / idle / offline)
- Typing indicators
- AI assistant (mentions & summarization)
- User avatars + uploads
- Responsive UI
- Prisma ORM + PostgreSQL

---

## Tech Stack

- Frontend: Next.js (React + TypeScript)
- Backend: NestJS + Prisma ORM
- Database: PostgreSQL (Docker)
- Realtime: WebSockets (Socket.IO)
- Monorepo: Turborepo (pnpm workspaces)

---

## Project Structure

```
apps/
├─ api/ → NestJS backend (REST + WebSocket)
└─ web/ → Next.js frontend UI
```

---

## Features

### Authentication

- Register & Login
- JWT access tokens
- Automatic token injection in API + WebSocket calls

### Messaging

- Public channels
- Direct message channels (DM)
- Live message streaming
- Auto-scrolling
- Persistent message history

### Presence

Lightweight realtime presence system:

- **Online** when connected
- **Idle** after 5 minutes of inactivity
- **Offline** when all sockets disconnect

### Typing Indicators

- Realtime
- Supports multiple typers and AI Chat Bot
- Per-channel

### Avatars & Uploads

- Local image uploads
- Avatar management UI
- Fallback avatar
- Uploads folder git-ignored by default

---

## Prerequisites

- Node.js 18+ (recommended 20+)
- pnpm (via Corepack or manual install)
- Docker Desktop (for PostgreSQL)

---

## AI Chat Bot

The platform includes an integrated AI assistant powered by **Groq LLMs**.

### Capabilities

- Mention-based interaction (`@BambooBob`)
- Natural language responses using Groq's OpenAI-compatible API
- Context-aware replies using recent chat history
- Rate-limited to prevent spam
- Scoped to public channels (not active in DMs)

### Available Commands

- `!help` – show available commands
- `!rules` – show channel rules
- `!ping` – simple connectivity test
- `!whoami` – show your user id
- `!summarize` – summarize recent messages

### Design choices

- Commands are handled deterministically for speed and reliability
- LLM is only invoked when needed (mention-based)
- System prompts enforce concise, language-matching responses
- No blocking of normal message flow if the AI fails

---

## Quick Start

1. Clone & install

   git clone https://github.com/<your-username>/chat-ai-platform.git
   cd chat-ai-platform
   pnpm install

2. Environment variables

   The project uses **separate environment files** for backend and frontend.
   - Backend variables go in `apps/api/.env`
   - Frontend variables go in `apps/web/.env.local`

   ### Backend (apps/api/.env)

   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/chat"
   JWT_SECRET="dev-secret-change-me"

   # AI (Groq)

   GROQ_API_KEY="your-groq-api-key"
   GROQ_MODEL="llama-3.1-8b-instant"
   GROQ_BASE_URL="https://api.groq.com/openai/v1"
   ```

   ### Frontend (apps/web/.env.local)

   ```env
   NEXT_PUBLIC_API_BASE="http://localhost:3000"
   PORT=3001
   ```

3. Start the database (Docker)

   docker-compose up -d

   The database will listen on port 5432.

4. Start the backend (NestJS, port 3000)

   pnpm -F api start:dev

   API base URL: http://localhost:3000

5. Start the frontend (Next.js, port 3001)

   pnpm -F web dev -- --port 3001

   Frontend URL: http://localhost:3001
   Ensure the frontend env points at the API:
   NEXT_PUBLIC_API_BASE=http://localhost:3000

---

## Useful Commands

- Run all apps with Turbo:
  pnpm run dev

- Backend only:
  pnpm -F api start:dev

- Frontend only (fixed port 3001):
  pnpm -F web dev -- --port 3001

- Start database:
  docker-compose up -d

- Stop database/containers:
  docker-compose down

---

## Docker Compose (included in repo)

```yaml
version: "3.9"

services:
  db:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: chat
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Notes

- The backend uses a JwtStrategy to validate Bearer tokens on protected routes and socket connections.
- Prisma manages the schema and migrations; models include User, Channel, and Message.
- The frontend stores the access token in localStorage and attaches it to requests; an Axios interceptor clears invalid tokens.
- The AI bot is implemented as a NestJS service and communicates with Groq using an OpenAI-compatible API.
- The bot is triggered only via mentions or explicit commands to reduce cost and noise.

---

## License

MIT © 2025 Joachim Tramper

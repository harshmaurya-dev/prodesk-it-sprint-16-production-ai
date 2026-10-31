# Prodesk IT — Sprint 16

A full-stack employee workspace built with React, Vite, Express and MongoDB. Sprint 16 focuses on production polish: API security, request logging, server-side AI, employee data enrichment and responsive UI states.

## Features

- JWT registration and login with bcrypt password hashing
- Helmet security headers, API rate limiting and stricter authentication rate limiting
- Pino request and application logging
- User-scoped employee CRUD operations
- Server-side AI summaries and team recommendations
- AI-assisted employee profile enrichment with a safe fallback when the AI provider is unavailable
- React error boundary, loading indicators, form states and toast notifications
- Responsive dashboard for desktop, tablet and mobile
- API health endpoint that reports MongoDB connection status

## Project structure

```text
client/          React + Vite frontend
server/          Express + MongoDB API
package.json     Root development and build scripts
```

## Run locally

1. Install root dependencies and both app dependencies:

   ```bash
   npm run install-all
   ```

2. Copy `server/.env.example` to `server/.env` and configure MongoDB and a strong JWT secret.

3. Copy `client/.env.example` to `client/.env`. Keep the local API URL for local development.

4. Start the frontend and backend:

   ```bash
   npm run dev
   ```

5. Create an account from the register page and add employee records.

## Environment variables

### Backend

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (Render supplies this automatically) |
| `NODE_ENV` | Set to `production` for deployment |
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Random secret of at least 32 characters |
| `CLIENT_URL` | Frontend origin; comma-separated origins are supported |
| `OPENAI_API_KEY` | Optional server-side AI provider key |
| `OPENAI_MODEL` | AI model name |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL |
| `LOG_LEVEL` | Pino log level, such as `info` or `debug` |

The AI provider key must only be configured on the backend. Never add it to a `VITE_*` variable or commit a real secret.

### Frontend

Set `VITE_API_URL` to the backend API base URL, including `/api`.

Example:

```env
VITE_API_URL=https://your-backend-service.onrender.com/api
```

## Deployment notes

### Backend — Render

- Create a Web Service from this repository.
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Add `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, `NODE_ENV=production` and optional AI variables in Render environment settings.
- After deployment, verify `https://YOUR-BACKEND-URL/api/health`.

### Frontend — Vercel

- Import this repository into Vercel.
- Root directory: `client`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Add `VITE_API_URL=https://YOUR-BACKEND-URL/api` in Vercel environment variables, then redeploy.
- Add the Vercel frontend origin to backend `CLIENT_URL`.

## Useful commands

```bash
npm run dev
npm run build
npm --prefix server start
npm --prefix client run build
```

## Security reminders

- Do not commit `.env` files or real credentials.
- Use a unique, randomly generated JWT secret in production.
- Restrict MongoDB Atlas network access to the addresses required by your deployment.
- Configure the exact frontend origin in `CLIENT_URL`.

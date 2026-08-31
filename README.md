# Prodesk Sprint 16 — Production + AI

Sprint 16 Track B implementation: server hardening, production logging, server-side AI, data enrichment, responsive React UI, loading states and graceful failures.

## Setup
1. Copy `server/.env.example` to `server/.env` and set MongoDB, JWT and AI credentials.
2. Copy `client/.env.example` to `client/.env`.
3. Run `npm run install-all` then `npm run dev`.

The AI key is server-only and is never exposed through `VITE_*` variables.

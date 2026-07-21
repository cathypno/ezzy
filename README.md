# Ezcord

Telegram-friendly voice rooms built with Nuxt, WebRTC mesh audio, Postgres, Redis and WebSocket signaling.

## Features

- Email registration and login.
- Telegram Mini App account linking.
- Public, private and Telegram-chat-bound rooms.
- Invite links for private rooms.
- Browser-to-browser WebRTC audio.
- WebSocket signaling with HTTP polling fallback.
- Redis live state and rate limits.
- Postgres persistent users, sessions, rooms and kick records.
- Maximum 5 participants per room.
- Health and metrics endpoints.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000/ezcord`.

If `EZCORD_DATABASE_URL` and `EZCORD_REDIS_URL` are not set, Ezcord falls back to local JSON state. For production, use Postgres and Redis.

## Production Notes

Required services:

- Node.js 20.19+ or 22/24 LTS.
- Postgres.
- Redis.
- A reverse proxy that forwards WebSocket upgrade headers.

The Postgres schema is created automatically on first startup. Existing `data/ezcord.json` state is migrated once when Postgres is enabled.

## CI/CD

GitHub Actions deploys Ezcord files into the current production Nuxt app at `/var/www/rs-platform` and restarts PM2 process `rocketseven-site`.

Add these repository secrets in GitHub:

- `EZCORD_DEPLOY_HOST`: server host, for example `155.212.135.121`
- `EZCORD_DEPLOY_USER`: SSH user, for example `root`
- `EZCORD_DEPLOY_SSH_KEY`: private SSH key with access to the server

The production `.env` stays on the server and is not copied from GitHub.

Health check:

```bash
curl https://your-domain.example/api/ezcord/health
```

Authenticated metrics:

```text
/api/ezcord/metrics
```

## Telegram

Set `EZCORD_BOT_TOKEN`, `EZCORD_WEBAPP_URL` and optionally `EZCORD_WEBHOOK_SECRET`.

The webhook endpoint is:

```text
/api/ezcord/telegram/webhook
```

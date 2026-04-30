# EmbedSim Compilation Backend

Production-grade Arduino compilation backend powered by `arduino-cli`, Express, Socket.IO, Bull (Redis), and PM2.

## Architecture

```
Browser  ──HTTP/WS──▶  API (Express + Socket.IO)  ──Bull queue──▶  Worker (arduino-cli)
                              │                                          │
                              └──── Redis (queue + cache) ◀──────────────┘
```

- **API** (`server.js`) — accepts compile requests, queues jobs, streams progress over Socket.IO, exposes Bull-board admin UI at `/admin/queues`.
- **Worker** (`queue/compileWorker.js`) — pulls jobs, runs `arduino-cli compile` with a timeout, parses errors/warnings, returns base64 binary + memory stats. Hits Redis cache for identical builds (smart hash of files + board + libraries).
- **Redis** — Bull job storage + compile-result cache (TTL configurable).
- **Nginx** — reverse-proxies `/api`, `/socket.io`, `/admin/queues` to port 3001.

## Quick start (local dev)

```bash
cp .env.example .env
npm install
# In one terminal:
npm run dev
# In another:
npm run worker
```

You also need Redis (`redis-server`) and `arduino-cli` available on `$PATH` or at `ARDUINO_CLI_PATH`.

## VPS deployment

Run `scripts/setup-vps.sh` on a fresh Ubuntu 22.04 box (as root). It installs Node 20, Redis, Nginx, `arduino-cli`, all common board cores (AVR, SAMD, ESP32, ESP8266, STM32, RP2040), 20+ common libraries, configures Nginx, and starts both processes under PM2.

```bash
cd /opt/embedsim   # clone or copy this folder here first
bash scripts/setup-vps.sh
```

For TLS:

```bash
certbot --nginx -d yourdomain.com
```

## Docker

```bash
cd docker
CORS_ORIGIN=https://yourdomain.com docker compose up -d --build
```

## API

| Method | Path                         | Purpose                                         |
| ------ | ---------------------------- | ----------------------------------------------- |
| GET    | `/api/health`                | Service + queue stats + arduino-cli version     |
| GET    | `/api/boards`                | All supported boards (id → fqbn, name, sizes)   |
| POST   | `/api/boards/install`        | `{ package: "esp32:esp32" }` — install a core   |
| GET    | `/api/boards/installed`      | Installed cores                                 |
| GET    | `/api/libraries`             | Installed libraries                             |
| GET    | `/api/libraries/search?q=`   | Search registry                                 |
| POST   | `/api/libraries/install`     | `{ name, version? }`                            |
| POST   | `/api/libraries/upload`      | `multipart/form-data` field `zipfile`           |
| DELETE | `/api/libraries/:name`       | Uninstall                                       |
| POST   | `/api/compile`               | `{ board, files[], libraries[] }` → `{ jobId }` |
| GET    | `/api/compile/:jobId`        | Poll job state (fallback when WS unavailable)   |

Live updates over Socket.IO:

```js
socket.emit('subscribe:job', jobId);
socket.on('compile:progress', ({ percent, step, message, lastLine }) => …);
socket.on('compile:done',     ({ result }) => …);   // success or build failed
socket.on('compile:error',    ({ error, errors }) => …);  // queue/worker crash
```

## Caching

A SHA-256 of `{ files, board, libraries }` (file order normalised) keys the Redis result cache. Identical builds across users are served instantly with `fromCache: true`. TTL via `CACHE_TTL_SECONDS` (default 1h).

## Limits & safety

- `COMPILE_TIMEOUT_MS` per build (default 90s; SIGKILL on overrun).
- Per-IP rate limit: `COMPILE_RATE_LIMIT_MAX` per minute.
- Joi-validated payloads (file extension allowlist, size cap, max files).
- Each job runs in `/tmp/embedsim/<jobId>/`; cleaned up after `CLEANUP_AFTER_MS` (default 10min so the user has time to download the binary).
- Multer ZIP uploads capped at 20 MB.

## Environment variables

See `.env.example`. Important ones:

| Var                     | Default              | Notes                                    |
| ----------------------- | -------------------- | ---------------------------------------- |
| `PORT`                  | `3001`               |                                          |
| `CORS_ORIGIN`           | `*`                  | Set to your domain in production         |
| `REDIS_URL`             | `redis://localhost`  |                                          |
| `ARDUINO_CLI_PATH`      | `arduino-cli`        | Absolute path recommended                |
| `MAX_CONCURRENT_JOBS`   | `4`                  | Worker concurrency                       |
| `COMPILE_TIMEOUT_MS`    | `90000`              | Per-build timeout                        |
| `CACHE_ENABLED`         | `true`               | Set to `false` to disable result cache   |
| `CACHE_TTL_SECONDS`     | `3600`               |                                          |

## Frontend wiring

The frontend uses `src/services/compilerService.ts`. Set `VITE_API_URL` to your backend root (e.g. `https://api.yourdomain.com`). The Compile button in the IDE submits a job, listens for progress over Socket.IO, falls back to HTTP polling after 3s, and renders errors as Monaco markers + a result panel.

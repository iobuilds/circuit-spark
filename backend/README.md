# EmbedSim Compilation Backend

Drop-in **Node.js + Express + arduino-cli** server that powers real Arduino
compilation for the EmbedSim frontend.

## Quick start (Ubuntu 22.04 VPS)

```bash
# 1. Copy setup-vps.sh to your server
scp setup-vps.sh root@YOUR_SERVER_IP:/root/

# 2. Run it
ssh root@YOUR_SERVER_IP
chmod +x setup-vps.sh
sudo ./setup-vps.sh
```

When the script finishes:
- API runs on port `3001` and is reverse-proxied by Nginx on port `80`
- arduino-cli + AVR/ESP32/ESP8266/STM32/RP2040 cores + ~18 popular libraries are installed
- PM2 keeps the server alive across reboots

## Wiring up the frontend

Create a `.env` file in the React project root:

```
VITE_API_URL=https://your-domain.com
```

Then re-deploy. When `VITE_API_URL` is set, the IDE talks to your server.
When unset, it falls back to a local mock so the UI remains usable.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/compile` | Compile a multi-file sketch, returns base64 .hex |
| `POST` | `/api/libraries/install` | Install a library by name |
| `POST` | `/api/libraries/upload` | Install a library from an uploaded `.zip` |
| `GET`  | `/api/libraries/installed` | List installed libraries |
| `GET`  | `/api/libraries/search?q=` | Search the Arduino library index |
| `GET`  | `/api/boards/installed` | List installed board cores |
| `POST` | `/api/boards/install` | Install a board core (e.g. `esp32:esp32`) |
| `GET`  | `/api/health` | Health probe |

## Compile request shape

```json
{
  "board": "uno",
  "files": [
    { "name": "sketch.ino", "content": "void setup(){} void loop(){}" },
    { "name": "helpers.h",  "content": "#pragma once" }
  ],
  "libraries": ["DHT sensor library"]
}
```

`board` accepts both internal sim ids (`uno`, `esp32`, …) and raw FQBNs
(`arduino:avr:uno`, `esp32:esp32:esp32dev`).

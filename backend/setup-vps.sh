#!/bin/bash
# EmbedSim Compilation Server Setup Script
# Tested on Ubuntu 22.04 LTS
#
# Usage:
#   chmod +x setup-vps.sh
#   sudo ./setup-vps.sh
#
# After setup, point your frontend at this server by setting:
#   VITE_API_URL=http://YOUR_SERVER_IP   (or https://yourdomain.com)

set -e

echo "=== EmbedSim VPS Setup ==="

# System update
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git unzip build-essential

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version

# arduino-cli
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
mv bin/arduino-cli /usr/local/bin/ || true
arduino-cli version

# arduino-cli config
arduino-cli config init || true
arduino-cli config set board_manager.additional_urls \
  "https://arduino.esp8266.com/stable/package_esp8266com_index.json,https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json,https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json"

arduino-cli core update-index
arduino-cli lib update-index

# Core boards
arduino-cli core install arduino:avr
arduino-cli core install arduino:samd || true
arduino-cli core install esp8266:esp8266 || true
arduino-cli core install esp32:esp32 || true
arduino-cli core install STMicroelectronics:stm32 || true
arduino-cli core install rp2040:rp2040 || true

# Common libraries
for lib in \
  "DHT sensor library" \
  "Adafruit BMP280 Library" \
  "LiquidCrystal I2C" \
  "Adafruit SSD1306" \
  "Adafruit GFX Library" \
  "OneWire" \
  "DallasTemperature" \
  "ArduinoJson" \
  "PubSubClient" \
  "Servo" \
  "Stepper" \
  "FastLED" \
  "Adafruit NeoPixel" \
  "TinyGPS++" \
  "IRremote" \
  "U8g2" \
  "WiFiManager" \
  "TaskScheduler"; do
  arduino-cli lib install "$lib" || echo "  (skipped $lib)"
done

# PM2
npm install -g pm2

# App directory
mkdir -p /opt/embedsim
cd /opt/embedsim

# API server
cat > server.js << 'SERVEREOF'
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const upload = multer({ dest: '/tmp/uploads/' });

// Map our internal sim board ids -> arduino-cli FQBNs.
// Frontend may also send a raw FQBN ("arduino:avr:uno") which is passed through.
const BOARD_FQBN = {
  'uno': 'arduino:avr:uno',
  'mega': 'arduino:avr:mega',
  'nano': 'arduino:avr:nano',
  'esp32': 'esp32:esp32:esp32dev',
  'esp8266': 'esp8266:esp8266:nodemcuv2',
  'stm32': 'STMicroelectronics:stm32:GenF1:pnum=BLUEPILL_F103C8',
  'rp2040': 'rp2040:rp2040:rpipico',
};

function fqbnFor(board) {
  if (!board) return 'arduino:avr:uno';
  if (board.includes(':')) return board;
  return BOARD_FQBN[board] || 'arduino:avr:uno';
}

function safeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function parseCompilerErrors(output) {
  const errors = [];
  const regex = /([^\s:][^:]*?):(\d+):(\d+):\s+(error|warning):\s+(.+)/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    errors.push({
      file: path.basename(match[1]),
      line: parseInt(match[2], 10),
      col: parseInt(match[3], 10),
      severity: match[4],
      message: match[5].trim(),
    });
  }
  if (errors.length === 0) {
    errors.push({ file: 'sketch', line: 1, col: 1, message: String(output).slice(0, 500) });
  }
  return errors;
}

// POST /api/compile
app.post('/api/compile', async (req, res) => {
  const { board, files = [], libraries = [] } = req.body || {};
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, errors: [{ file: 'request', line: 0, message: 'No files provided' }] });
  }

  const jobId = uuidv4();
  const tmpDir = path.join(os.tmpdir(), 'embedsim', jobId);

  // arduino-cli requires the sketch folder name to match the .ino filename.
  const inoFile = files.find((f) => f.name && f.name.endsWith('.ino'));
  if (!inoFile) {
    return res.status(400).json({ success: false, errors: [{ file: 'request', line: 0, message: 'No .ino file provided' }] });
  }
  const sketchName = path.basename(inoFile.name, '.ino').replace(/[^a-zA-Z0-9_-]/g, '_') || 'sketch';
  const sketchDir = path.join(tmpDir, sketchName);

  try {
    fs.mkdirSync(sketchDir, { recursive: true });
    for (const file of files) {
      if (!file.name) continue;
      const target = file.name.endsWith('.ino')
        ? path.join(sketchDir, sketchName + '.ino')
        : path.join(sketchDir, safeFilename(file.name));
      fs.writeFileSync(target, String(file.content ?? ''));
    }

    const fqbn = fqbnFor(board);
    const outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    const libArg = (libraries || [])
      .filter(Boolean)
      .map((l) => `--library "$HOME/Arduino/libraries/${String(l).replace(/"/g, '')}"`)
      .join(' ');

    const cmd = `arduino-cli compile --fqbn "${fqbn}" --output-dir "${outputDir}" ${libArg} "${sketchDir}"`;

    exec(cmd, { timeout: 90000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Cleanup after 5 minutes
      setTimeout(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} }, 300000);

      const combined = (stdout || '') + '\n' + (stderr || '');

      if (error) {
        const errors = parseCompilerErrors(combined);
        return res.json({
          success: false,
          errors,
          warnings: [],
          stdout,
          stderr,
          compiledAt: new Date().toISOString(),
        });
      }

      // Read compiled artifact (.hex preferred, .bin fallback)
      let binary = null;
      let binarySize = 0;
      try {
        const all = fs.readdirSync(outputDir);
        const hex = all.find((f) => f.endsWith('.hex')) || all.find((f) => f.endsWith('.bin'));
        if (hex) {
          const data = fs.readFileSync(path.join(outputDir, hex));
          binary = data.toString('base64');
          binarySize = data.length;
        }
      } catch (_) {}

      // Pull program/data sizes from compiler output if present
      let flashPercent;
      let ramUsed;
      let ramPercent;
      const flashMatch = stdout.match(/Sketch uses\s+(\d+)\s+bytes.*?\((\d+)%/s);
      const ramMatch = stdout.match(/Global variables use\s+(\d+)\s+bytes.*?\((\d+)%/s);
      if (flashMatch) flashPercent = parseInt(flashMatch[2], 10);
      if (ramMatch) { ramUsed = parseInt(ramMatch[1], 10); ramPercent = parseInt(ramMatch[2], 10); }

      res.json({
        success: true,
        stdout,
        stderr,
        errors: [],
        warnings: parseCompilerErrors(combined).filter((e) => e.severity === 'warning'),
        binary,
        binarySize,
        flashPercent,
        ramUsed,
        ramPercent,
        compiledAt: new Date().toISOString(),
      });
    });
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    res.status(500).json({ success: false, errors: [{ file: 'server', line: 0, message: e.message }] });
  }
});

// POST /api/libraries/install
app.post('/api/libraries/install', (req, res) => {
  const { name, version } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'name required' });
  try {
    const libStr = version ? `"${name}@${version}"` : `"${name}"`;
    execSync(`arduino-cli lib install ${libStr}`, { timeout: 120000 });
    res.json({ success: true, message: `${name} installed` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/libraries/upload (ZIP)
app.post('/api/libraries/upload', upload.single('zipfile'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'no file' });
  try {
    const zipPath = req.file.path;
    const out = execSync(`arduino-cli lib install --zip-path "${zipPath}"`, { timeout: 60000 }).toString();
    fs.unlinkSync(zipPath);
    const nameMatch = out.match(/Installed\s+([^\s@]+)/);
    res.json({
      success: true,
      name: nameMatch ? nameMatch[1] : path.basename(req.file.originalname, '.zip'),
      headers: [],
      message: 'Library installed from ZIP',
    });
  } catch (e) {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/libraries/installed
app.get('/api/libraries/installed', (_req, res) => {
  try {
    const out = execSync('arduino-cli lib list --format json', { timeout: 30000 }).toString();
    res.json({ success: true, libraries: JSON.parse(out) });
  } catch (_e) {
    res.json({ success: true, libraries: [] });
  }
});

// GET /api/libraries/search?q=DHT
app.get('/api/libraries/search', (req, res) => {
  const q = (req.query.q || '').toString();
  try {
    const out = execSync(`arduino-cli lib search ${JSON.stringify(q)} --format json`, { timeout: 30000 }).toString();
    res.json({ success: true, results: JSON.parse(out) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/boards/installed
app.get('/api/boards/installed', (_req, res) => {
  try {
    const out = execSync('arduino-cli core list --format json', { timeout: 30000 }).toString();
    res.json({ success: true, boards: JSON.parse(out) });
  } catch (_e) {
    res.json({ success: true, boards: [] });
  }
});

// POST /api/boards/install
app.post('/api/boards/install', (req, res) => {
  const { package: pkg } = req.body || {};
  if (!pkg) return res.status(400).json({ success: false, error: 'package required' });
  try {
    execSync(`arduino-cli core install ${JSON.stringify(pkg)}`, { timeout: 600000 });
    res.json({ success: true, message: `${pkg} installed` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => console.log(`EmbedSim API running on port ${PORT}`));
SERVEREOF

# Node deps
cat > package.json << 'PKGEOF'
{
  "name": "embedsim-api",
  "version": "1.0.0",
  "main": "server.js",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "uuid": "^9.0.0"
  }
}
PKGEOF

npm install

# PM2
pm2 start server.js --name embedsim-api || pm2 restart embedsim-api
pm2 startup systemd -u root --hp /root || true
pm2 save

# Nginx + Certbot
apt-get install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/embedsim << 'NGINXEOF'
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/embedsim /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# UFW
ufw allow 22 || true
ufw allow 80 || true
ufw allow 443 || true
ufw allow 3001 || true
ufw --force enable || true

echo ""
echo "=== Setup Complete! ==="
echo "API running at: http://YOUR_SERVER_IP:3001"
echo "Test:           curl http://YOUR_SERVER_IP:3001/api/health"
echo ""
echo "Next steps:"
echo "1. Replace YOUR_DOMAIN_OR_IP in /etc/nginx/sites-available/embedsim, then: systemctl reload nginx"
echo "2. (HTTPS) certbot --nginx -d yourdomain.com"
echo "3. In your frontend .env, set: VITE_API_URL=https://yourdomain.com"

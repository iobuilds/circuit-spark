#!/bin/bash
set -e
echo "=== EmbedSim VPS Setup ==="

# Update system
apt-get update && apt-get upgrade -y
apt-get install -y curl wget git unzip build-essential redis-server nginx certbot python3-certbot-nginx

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# arduino-cli
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
mv bin/arduino-cli /usr/local/bin/
arduino-cli version

# Config arduino-cli
arduino-cli config init
arduino-cli config set board_manager.additional_urls \
  "https://arduino.esp8266.com/stable/package_esp8266com_index.json,https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json,https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json,https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json"
arduino-cli core update-index
arduino-cli lib update-index

# Install cores
arduino-cli core install arduino:avr
arduino-cli core install arduino:samd
arduino-cli core install esp8266:esp8266
arduino-cli core install esp32:esp32
arduino-cli core install STMicroelectronics:stm32
arduino-cli core install rp2040:rp2040

# Common libraries
libs=("DHT sensor library" "Adafruit BMP280 Library" "LiquidCrystal I2C" "Adafruit SSD1306" "Adafruit GFX Library" "OneWire" "DallasTemperature" "ArduinoJson" "PubSubClient" "Servo" "Stepper" "FastLED" "Adafruit NeoPixel" "TinyGPS++" "IRremote" "U8g2" "WiFiManager" "TaskScheduler" "ArduinoOTA" "WebSockets")
for lib in "${libs[@]}"; do
  arduino-cli lib install "$lib" || echo "Warning: could not install $lib"
done

# Redis config
systemctl enable redis-server
systemctl start redis-server

# App setup
mkdir -p /opt/embedsim /var/log/embedsim /tmp/embedsim
cd /opt/embedsim

npm install -g pm2
npm install

# Nginx config
cat > /etc/nginx/sites-available/embedsim << 'EOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
        proxy_connect_timeout 30s;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }

    location /admin/queues/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/embedsim /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable

pm2 start ecosystem.config.js --env production
pm2 startup && pm2 save

echo ""
echo "=== Setup Complete! ==="
echo "API: http://$(curl -s ifconfig.me):3001/api/health"
echo "Queue Dashboard: http://$(curl -s ifconfig.me)/admin/queues"
echo ""
echo "For SSL: certbot --nginx -d yourdomain.com"

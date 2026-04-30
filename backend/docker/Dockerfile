FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl wget git unzip build-essential nodejs npm redis-server \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh \
    && mv bin/arduino-cli /usr/local/bin/

RUN arduino-cli config init \
    && arduino-cli config set board_manager.additional_urls \
       "https://arduino.esp8266.com/stable/package_esp8266com_index.json,https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json" \
    && arduino-cli core update-index \
    && arduino-cli core install arduino:avr \
    && arduino-cli core install esp32:esp32 \
    && arduino-cli core install esp8266:esp8266

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

RUN mkdir -p /tmp/embedsim /var/log/embedsim

EXPOSE 3001
CMD ["node", "server.js"]

FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Установим node deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Копируем исходники
COPY . .

# Сборка TypeScript (если есть)
RUN npm run build || true

# Порт MCP-сервера
EXPOSE 8831

# Запуск MCP-сервера. В README есть список аргументов, в т.ч. allowed-hosts/origins и caps.
# Включаем tracing-капабилити и биндим на 0.0.0.0 для SSE.
CMD ["node", "cli.js", "--host", "0.0.0.0", "--port", "8831", "--headless", "--no-sandbox", "--user-data-dir", "/data/profile", "--output-dir", "/data", "--caps=tracing", "--allowed-hosts", "mcp-playwright-recorder.qabot.app"]

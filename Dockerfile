FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Установим node deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Копируем исходники
COPY . .

# Сборка TypeScript для recording tools
RUN npx tsc src/recordingTools.ts --target es2020 --module commonjs --outDir lib --skipLibCheck --esModuleInterop || true

# Порт MCP-сервера
EXPOSE 8831

# Запуск recording MCP-сервера
CMD ["node", "recording-server.js", "--host", "0.0.0.0", "--port", "8831"]

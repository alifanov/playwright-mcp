FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Установим node deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Копируем исходники
COPY . .

# Сборка recording tools (используем готовый скрипт)
RUN npm run build

# Проверим что файлы созданы
RUN ls -la lib/ || echo "No lib directory created"

# Порт MCP-сервера
EXPOSE 8831

# Запуск recording MCP-сервера
CMD ["node", "recording-server.js", "--host", "0.0.0.0", "--port", "8831"]

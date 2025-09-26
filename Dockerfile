FROM mcr.microsoft.com/playwright:v1.47.2-jammy

# Установим node deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Копируем исходники
COPY . .

# Убедимся что папка lib существует и проверим файлы
RUN mkdir -p lib && ls -la lib/ && echo "Recording tools files:" && find . -name "*recording*" -type f

# Порт MCP-сервера
EXPOSE 8831

# Запуск recording MCP-сервера
CMD ["node", "recording-server.js", "--host", "0.0.0.0", "--port", "8831"]

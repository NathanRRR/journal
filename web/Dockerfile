FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_JOURNAL_API_BASE_URL
ENV VITE_JOURNAL_API_BASE_URL=$VITE_JOURNAL_API_BASE_URL

RUN npm run build

CMD ["sh", "-c", "rm -rf /output/* && cp -r dist/. /output/"]

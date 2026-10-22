FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Prisma 5 detects the OpenSSL ABI during client generation. Install OpenSSL
# first so it selects the Debian 12 (OpenSSL 3) engine for this image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate && npm prune --omit=dev

COPY src ./src

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 5005
CMD ["npm", "start"]

# --- build stage ---
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime stage ---
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Chromium + system deps for Playwright auto-apply
RUN npx -y playwright@1.61.1 install --with-deps chromium \
  && rm -rf /root/.npm

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3040
ENV PORT=3040
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g bun
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g bun
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Explicitly copy the schema to bust cache if only schema changed
COPY prisma/schema.prisma prisma/schema.prisma
RUN bun run db:generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node server.js"]

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN npm install -g npm@11
COPY package*.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN npm ci --workspace=@slurp/web --include-workspace-root

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/web/ ./apps/web/
COPY packages/types/src/ ./packages/types/src/
RUN npm run build --workspace=@slurp/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
RUN apk upgrade --no-cache

# Next.js standalone output with outputFileTracingRoot set to monorepo root:
# server.js lands at apps/web/server.js, node_modules at root
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 8080
CMD ["node", "apps/web/server.js"]

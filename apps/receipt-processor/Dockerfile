FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g npm@11

# Copy workspace root manifests + receipt-processor + types manifests
COPY package*.json ./
COPY apps/receipt-processor/package.json ./apps/receipt-processor/
COPY packages/types/package.json ./packages/types/

# Install receipt-processor workspace deps
RUN npm ci --workspace=@slurp/receipt-processor --include-workspace-root

# Build
COPY tsconfig.base.json ./
COPY apps/receipt-processor/tsconfig.json ./apps/receipt-processor/
COPY apps/receipt-processor/src/ ./apps/receipt-processor/src/
COPY packages/types/src/ ./packages/types/src/
RUN npm run build --workspace=@slurp/receipt-processor

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk upgrade --no-cache && npm install -g npm@11

COPY package*.json ./
COPY apps/receipt-processor/package.json ./apps/receipt-processor/
RUN npm ci --workspace=@slurp/receipt-processor --include-workspace-root --omit=dev

COPY --from=builder /app/apps/receipt-processor/dist ./apps/receipt-processor/dist

EXPOSE 8080
CMD ["node", "apps/receipt-processor/dist/apps/receipt-processor/src/index.js"]

FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g npm@11

# Copy workspace root manifests + api + types manifests
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

# Install api workspace deps
RUN npm ci --workspace=@slurp/api --include-workspace-root

# Build
COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json ./apps/api/
COPY apps/api/src/ ./apps/api/src/
COPY packages/types/src/ ./packages/types/src/
RUN npm run build --workspace=@slurp/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g npm@11

COPY package*.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=@slurp/api --include-workspace-root --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 8080
CMD ["node", "apps/api/dist/apps/api/src/index.js"]

# syntax=docker/dockerfile:1

# --- base: dependências de runtime resolvidas uma única vez ---
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./

# --- deps: node_modules completo, inclusive devDependencies ---
FROM base AS deps
RUN npm ci --include=dev

# --- development: nodemon + código montado por bind mount ---
FROM base AS development
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]

# --- production: só dependências de runtime, usuário sem privilégio ---
FROM base AS production
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts
USER node
EXPOSE 5000
CMD ["npm", "run", "start"]

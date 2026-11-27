# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# --- development: dev server do Vite com HMR ---
FROM node:20-alpine AS development
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- build: bundle estático ---
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:5000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- production: nginx servindo dist/, com fallback de SPA ---
FROM nginx:1.27-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

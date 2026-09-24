# -- dev: used by docker-compose.yml, source mounted as a volume for hot reload --
FROM node:24-alpine AS dev
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
EXPOSE 57800
CMD ["npm", "run", "start:dev"]

# -- deps: production dependencies only --
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts

# -- build: compile TypeScript, generate Prisma client --
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# -- runtime: minimal production image --
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache curl

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 57800
CMD ["node", "dist/main"]

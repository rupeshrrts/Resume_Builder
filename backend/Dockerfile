# Resume Builder API. Build from the repository root:
#   docker build -f backend/Dockerfile -t resume-api .
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies for the API and the shared package only.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace backend --workspace shared && npm cache clean --force

COPY shared ./shared
COPY backend/src ./backend/src
COPY backend/certs ./backend/certs
COPY backend/tsconfig.json ./backend/
COPY database ./database

# tsx runs the TypeScript sources directly and resolves the "@/…" paths from backend/tsconfig.json.
WORKDIR /app/backend
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/server.ts"]

# Resume Builder website (Next.js). Build from the repository root:
#   docker build -f frontend/Dockerfile -t resume-web .
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
# Lets the build use swap on small (1 GB) servers instead of stopping with "heap out of memory".
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --workspace shared

COPY shared ./shared
COPY frontend ./frontend
# Pages rendered at build time (link previews, sitemap) bake these in; empty = the defaults.
ARG SITE_URL="" GOOGLE_SITE_VERIFICATION=""
ENV SITE_URL=$SITE_URL GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION
RUN npm run build -w frontend

FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# The standalone output contains only the files the server needs.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]

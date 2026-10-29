# syntax=docker/dockerfile:1

FROM node:24-alpine

LABEL org.opencontainers.image.title="Student Attendance Management System" \
      org.opencontainers.image.description="Seven-period attendance, monthly analytics and CSV reports." \
      org.opencontainers.image.version="1.0.0"

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend ./backend
COPY frontend ./frontend

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/server.js"]

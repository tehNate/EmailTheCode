FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY src ./src
COPY bin ./bin
COPY types ./types
COPY docs ./docs
COPY README.md LICENSE SECURITY.md ./

ENV NODE_ENV=production \
    EMAILTHECODE_HOST=0.0.0.0 \
    EMAILTHECODE_PORT=3100 \
    EMAILTHECODE_LOG_FILE=/tmp/emailthecode.jsonl

USER node
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "bin/emailthecode.js", "serve"]

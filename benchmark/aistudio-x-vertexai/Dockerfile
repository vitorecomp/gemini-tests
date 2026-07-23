FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./
COPY sample-files ./sample-files

# Credentials and options are provided at runtime via env vars (see README.md)
ENTRYPOINT ["node", "index.js"]

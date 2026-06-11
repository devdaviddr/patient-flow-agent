# Next.js app: UI + loop driver + in-process simulator + eval harness
FROM node:20-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci || npm install

# App source
COPY . .

EXPOSE 3000

# Dev server by default; override in compose/CI for production builds
CMD ["npm", "run", "dev"]

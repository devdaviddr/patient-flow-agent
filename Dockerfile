# Next.js app: UI + loop driver + in-process simulator + eval harness
FROM node:22-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci || npm install

# App source (node_modules/.next excluded via .dockerignore)
COPY . .

EXPOSE 3000

# Dev server, bound to 0.0.0.0 so it's reachable from the host and the opencode container
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

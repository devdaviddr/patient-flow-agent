# OpenCode agent harness, headless.
# Pinned version (development-Plan.md §2.3 — pin the OpenCode version).
FROM node:22-slim

# Pin to the exact version we develop/validate against.
ARG OPENCODE_VERSION=1.17.3
RUN npm install -g opencode-ai@${OPENCODE_VERSION}

# The harness reads .opencode/ and opencode.json from the working directory.
WORKDIR /workspace

EXPOSE 4096

# Bind 0.0.0.0 so the app container can reach it (default 127.0.0.1 is container-local).
ENTRYPOINT ["opencode"]
CMD ["serve", "--hostname", "0.0.0.0", "--port", "4096"]

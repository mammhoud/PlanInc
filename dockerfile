# Build Stage
FROM oven/bun:1.2.8 AS builder

# Add Build Arguments
ARG USE_MIRROR=false

WORKDIR /app

# Set Sharp environment variables to speed up ARM installation
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV npm_config_sharp_binary_host="https://npmmirror.com/mirrors/sharp"
ENV npm_config_sharp_libvips_binary_host="https://npmmirror.com/mirrors/sharp-libvips"

# Copy Project Files
COPY . .

# Configure Mirror Based on USE_MIRROR Parameter
RUN if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using Taobao Mirror to Install Dependencies" && \
        echo '{ "install": { "registry": "https://registry.npmmirror.com" } }' > .bunfig.json; \
    else \
        echo "Using Default Mirror to Install Dependencies"; \
    fi

# Pre-install Sharp for ARM architecture
RUN if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then \
        echo "Detected ARM architecture, installing sharp platform-specific dependencies..." && \
        mkdir -p /tmp/sharp-cache && \
        export SHARP_CACHE_DIRECTORY=/tmp/sharp-cache && \
        bun install --platform=linux --arch=arm64 sharp@0.34.1 --no-save --unsafe-perm || \
        bun install --force @img/sharp-linux-arm64 --no-save; \
    fi

# Install Dependencies and Build App
RUN bun install --unsafe-perm
# TURBO_CONCURRENCY=1 serialises the backend (esbuild) and frontend (vite) bundles.
# Running them in parallel peaks above this host's RAM and gets OOM-killed.
RUN TURBO_CONCURRENCY=1 bun run build:web

RUN printf '#!/bin/sh\necho "Current Environment: $NODE_ENV"\nnode server/index.js\n' > start.sh && \
    chmod +x start.sh


FROM node:20-alpine as init-downloader

WORKDIR /app

RUN wget -qO /app/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_$(uname -m) && \
    chmod +x /app/dumb-init && \
    rm -rf /var/cache/apk/*


# Runtime Stage - Using Alpine as required
FROM node:20-alpine AS runner

# Add Build Arguments
ARG USE_MIRROR=false

WORKDIR /app

# Environment Variables
ENV NODE_ENV=production
# If there is a proxy or load balancer behind HTTPS, you may need to disable secure cookies
ENV DISABLE_SECURE_COOKIE=false
# Set Trust Proxy
ENV TRUST_PROXY=1
# Set Sharp environment variables
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV npm_config_sharp_binary_host="https://npmmirror.com/mirrors/sharp"
ENV npm_config_sharp_libvips_binary_host="https://npmmirror.com/mirrors/sharp-libvips"

RUN apk add --no-cache openssl vips-dev python3 py3-setuptools make g++ gcc libc-dev linux-headers && \
    if [ "$USE_MIRROR" = "true" ]; then \
        echo "Using Taobao Mirror to Install Dependencies" && \
        npm config set registry https://registry.npmmirror.com; \
    else \
        echo "Using Default Mirror to Install Dependencies"; \
    fi

# Copy Build Artifacts and Necessary Files
COPY --from=builder /app/dist ./server
COPY --from=builder /app/server/lute.min.js ./server/lute.min.js
# Welcome-note seed assets (createSeed copies these into .planinc/files).
COPY --from=builder /app/server/seedfiles ./server/seedfiles
# Vendored Vditor deps (highlight CSS, mermaid, echarts, katex, ...) served by serveVditorFile.
COPY --from=builder /app/server/vditor ./server/vditor
COPY --from=builder /app/start.sh ./
COPY --from=init-downloader /app/dumb-init /usr/local/bin/dumb-init

RUN chmod +x ./start.sh && \
    ls -la start.sh

RUN if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then \
        echo "Detected ARM architecture, installing sharp platform-specific dependencies..." && \
        mkdir -p /tmp/sharp-cache && \
        export SHARP_CACHE_DIRECTORY=/tmp/sharp-cache && \
        npm install --platform=linux --arch=arm64 sharp@0.34.1 --no-save --unsafe-perm || \
        npm install --force @img/sharp-linux-arm64 --no-save; \
    fi

# Install runtime dependencies; legacy peer deps avoids optional peer conflicts from LangChain.
# (Prisma engines / prisma CLI are gone — the SurrealDB seed runs via the bundled
# server code itself, see start.sh.)
RUN echo "Installing additional dependencies..." && \
    npm install @node-rs/crc32 lightningcss sharp@0.34.1 && \
    npm install sqlite3@5.1.7 && \
    npm install --legacy-peer-deps llamaindex @langchain/community@0.3.40 && \
    npm install @libsql/client @libsql/core && \
    npm install --legacy-peer-deps surrealdb@^2.0.8 @surrealdb/node@^2.0.0 esbuild@^0.25.3 && \
    npm install --legacy-peer-deps @langchain/core@^0.3.0 pdf-parse@^1.1.1 && \
    rm -rf /tmp/* && \
    apk del python3 py3-setuptools make g++ gcc libc-dev linux-headers && \
    rm -rf /var/cache/apk/* /root/.npm /root/.cache

# Expose Port (Adjust According to Actual Application)
EXPOSE 1111

CMD ["/usr/local/bin/dumb-init", "--", "/bin/sh", "-c", "./start.sh"]

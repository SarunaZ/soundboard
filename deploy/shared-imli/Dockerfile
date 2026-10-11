# Build Imli from a named, allow-listed build context. The caller supplies this
# as `imli`; no `.env`, `.yarn`, generated output, or host node_modules are read.
FROM node:24-bookworm-slim AS imli-build
WORKDIR /build
COPY --from=imli /package.json ./package.json
COPY --from=imli /yarn.lock ./yarn.lock
COPY --from=imli /.yarnrc.yml ./.yarnrc.yml
COPY --from=imli /tsconfig.json ./tsconfig.json
COPY --from=imli /src ./src
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable \
 && YARN_NODE_LINKER=node-modules yarn install --immutable \
 && YARN_NODE_LINKER=node-modules yarn tsc -p tsconfig.json

# The existing image is built by the root compose workflow and already contains
# the compiled Soundboard service, node_modules, ffmpeg, and yt-dlp.
FROM soundboard-service:local
USER root
WORKDIR /imli
COPY --from=imli-build --chown=node:node /build/build ./build
COPY --from=imli-build --chown=node:node /build/node_modules ./node_modules
COPY deploy/shared-imli/gateway.mjs /opt/shared-imli/gateway.mjs
COPY deploy/shared-imli/health.mjs /opt/shared-imli/health.mjs
COPY deploy/shared-imli/supervisor.mjs /opt/shared-imli/supervisor.mjs
COPY deploy/shared-imli/test/fake-yt-dlp.sh /opt/shared-imli/test/fake-yt-dlp.sh
RUN sed -i 's/\r$//' /opt/shared-imli/test/fake-yt-dlp.sh \
 && chmod 0555 /opt/shared-imli/test/fake-yt-dlp.sh

# Keep the independent Imli dependency tree and user-owned runtime data separate
# from Soundboard's /app and /data paths.
RUN mkdir -p /data /var/tmp/soundboard /var/tmp/imli \
 && chown node:node /imli /data /var/tmp/soundboard /var/tmp/imli
ENV PORT=4000 \
    DB_PATH=/data/soundboard.db \
    TEMP_DIR=/var/tmp/soundboard
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -fsS --max-time 2 http://127.0.0.1:4000/__shared/ready || exit 1
WORKDIR /app
USER node
ENTRYPOINT ["node", "/opt/shared-imli/supervisor.mjs"]
CMD []

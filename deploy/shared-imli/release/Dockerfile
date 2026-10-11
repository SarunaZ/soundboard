ARG NODE_IMAGE=node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
FROM ${NODE_IMAGE} AS soundboard-build
WORKDIR /soundboard
ENV YARN_NODE_LINKER=node-modules YARN_ENABLE_IMMUTABLE_INSTALLS=true
COPY soundboard/ ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare yarn@4.18.0 --activate \
 && YARN_NODE_LINKER=node-modules YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn workspaces focus @soundboard/shared @soundboard/service \
 && yarn workspace @soundboard/shared build \
 && yarn workspace @soundboard/service build \
 && yarn workspaces focus @soundboard/service --production

FROM ${NODE_IMAGE} AS imli-build
WORKDIR /imli-build
ENV YARN_NODE_LINKER=node-modules YARN_ENABLE_IMMUTABLE_INSTALLS=true
COPY imli/ ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable \
 && corepack prepare yarn@4.6.0 --activate \
 && YARN_NODE_LINKER=node-modules YARN_ENABLE_IMMUTABLE_INSTALLS=true yarn install --immutable \
 && yarn tsc -p tsconfig.json

FROM ${NODE_IMAGE} AS runtime
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg tini \
 && rm -rf /var/lib/apt/lists/* \
 && curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux' \
      --output /usr/local/bin/yt-dlp \
 && echo '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a  /usr/local/bin/yt-dlp' | sha256sum --check --status \
 && chmod 0555 /usr/local/bin/yt-dlp \
 && mkdir -p /app /imli /data /var/tmp/soundboard /var/tmp/imli /opt/shared-imli \
 && chown node:node /app /imli /data /var/tmp/soundboard /var/tmp/imli
WORKDIR /app
COPY --from=soundboard-build --chown=node:node /soundboard/node_modules ./node_modules
COPY --from=soundboard-build --chown=node:node /soundboard/package.json ./package.json
COPY --from=soundboard-build --chown=node:node /soundboard/shared/package.json ./shared/package.json
COPY --from=soundboard-build --chown=node:node /soundboard/shared/dist ./shared/dist
COPY --from=soundboard-build --chown=node:node /soundboard/service/package.json ./service/package.json
COPY --from=soundboard-build --chown=node:node /soundboard/service/dist ./service/dist
COPY --from=imli-build --chown=node:node /imli-build/build /imli/build
COPY --from=imli-build --chown=node:node /imli-build/node_modules /imli/node_modules
COPY --chown=node:node gateway.mjs health.mjs supervisor.mjs /opt/shared-imli/
COPY --chown=node:node release-manifest.json /opt/shared-imli/release-manifest.json
ARG SOUNDBOARD_REVISION
ARG IMLI_REVISION
ARG RELEASE_MANIFEST_SHA256
ARG PUBLISHABLE
LABEL org.soundboard.source.revision="${SOUNDBOARD_REVISION}" \
      org.soundboard.source.imli.revision="${IMLI_REVISION}" \
      org.soundboard.release.manifest.sha256="${RELEASE_MANIFEST_SHA256}" \
      org.soundboard.release.publishable="${PUBLISHABLE}"
ENV PORT=4000 \
    DB_PATH=/data/soundboard.db \
    TEMP_DIR=/var/tmp/soundboard \
    NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -fsS --max-time 2 http://127.0.0.1:4000/__shared/ready || exit 1
WORKDIR /app
USER node
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/shared-imli/supervisor.mjs"]
CMD []

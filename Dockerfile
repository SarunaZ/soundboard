# syntax=docker/dockerfile:1
#
# Image for the soundboard service (API + worker — one image, two commands).
# The RN app is not containerised: it builds to an APK and runs on the phone.
#
# Yarn 4 comes from corepack, pinned by the "packageManager" field in the root
# package.json. Never `npm i -g yarn` here — the version would drift from the
# lockfile.

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------------------------------------------------------------- deps -------
FROM ${NODE_IMAGE} AS deps
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# better-sqlite3 is a native module (DESIGN #12) and compiles here, in the
# builder — none of this reaches the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests only, so a source edit doesn't invalidate the install layer.
# app-client's manifest is copied because Yarn needs every workspace manifest
# present to resolve the lockfile — its dependencies are never installed.
COPY package.json yarn.lock .yarnrc.yml ./
COPY shared/package.json shared/
COPY service/package.json service/
COPY app-client/package.json app-client/

# `workspaces focus` installs only these two workspaces — no Expo, no RN.
RUN --mount=type=cache,target=/root/.yarn/berry/cache,sharing=locked \
    yarn workspaces focus @soundboard/shared @soundboard/service

# --------------------------------------------------------------- build -------
FROM deps AS build
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY service/ service/
RUN yarn workspace @soundboard/shared build \
 && yarn workspace @soundboard/service build

# Drop devDependencies now that dist/ exists. The compiled better-sqlite3
# binding survives — same base image, same glibc, same ABI as the runtime stage.
RUN --mount=type=cache,target=/root/.yarn/berry/cache,sharing=locked \
    yarn workspaces focus @soundboard/shared @soundboard/service --production

# ------------------------------------------------------------- runtime -------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/soundboard.db \
    TEMP_DIR=/var/tmp/soundboard

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# yt-dlp as a pinned self-contained binary (PLAN §1: pinned versions, invoked
# with spawn). "latest" is fine for development; pin a tag before the droplet
# deploy so a yt-dlp release can never change behaviour under you.
ARG YTDLP_VERSION=latest
RUN set -eux; \
    if [ "${YTDLP_VERSION}" = "latest" ]; then \
      url="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"; \
    else \
      url="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux"; \
    fi; \
    curl -fsSL "$url" -o /usr/local/bin/yt-dlp; \
    chmod 0755 /usr/local/bin/yt-dlp; \
    yt-dlp --version

WORKDIR /app
COPY --from=build /app/node_modules      ./node_modules
COPY --from=build /app/package.json      ./
COPY --from=build /app/shared/package.json  ./shared/
COPY --from=build /app/shared/dist          ./shared/dist
COPY --from=build /app/service/package.json ./service/
COPY --from=build /app/service/dist         ./service/dist

# /data holds SQLite — the only non-reconstructible state (PLAN R5).
# /var/tmp/soundboard holds masters, which are transient by design (#5).
RUN mkdir -p /data "${TEMP_DIR}" && chown -R node:node /data "${TEMP_DIR}" /app
USER node

EXPOSE 8080
CMD ["node", "service/dist/api/index.js"]

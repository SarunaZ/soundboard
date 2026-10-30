FROM node:24.22.1-alpine AS build

WORKDIR /site

ENV ASTRO_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable \
    && pnpm install --frozen-lockfile

COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public

ARG SITE_BASE=/
ENV SITE_BASE=${SITE_BASE}
RUN pnpm build

FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /site/dist/ /usr/share/nginx/html/

RUN sed -i '/^user[[:space:]]/d; s|^pid[[:space:]].*;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && mkdir -p /var/cache/nginx \
    && chown -R 101:101 /var/cache/nginx

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

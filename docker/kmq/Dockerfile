FROM node:18-alpine AS build

RUN apk add --no-cache git \
    python3 \
    make \
    g++ \
    autoconf \
    automake \
    libtool

WORKDIR /app

COPY yarn.lock package.json ./
RUN yarn install --frozen-lockfile

COPY start.sh tsconfig.json ./
COPY i18n/ i18n/
COPY src/ src/
COPY templates/ templates/
RUN npx tsc

COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql/ sql/

# ================================================================= #
FROM node:18-alpine
ARG TARGETARCH
RUN apk add --no-cache mysql-client \
    bash \
    curl

COPY --from=mwader/static-ffmpeg:6.0 /ffmpeg /usr/local/bin/
COPY --from=mwader/static-ffmpeg:6.0 /ffprobe /usr/local/bin/

RUN wget "https://azcopyvnext.azureedge.net/release20230331/azcopy_linux_${TARGETARCH}_10.18.0.tar.gz" \
    && tar xzfv azcopy_linux_${TARGETARCH}_10.18.0.tar.gz \
    && cp -fv azcopy_linux_${TARGETARCH}_10.18.0/azcopy /usr/bin \
    && chmod +x /usr/bin/azcopy \
    && rm -rfv azcopy_linux_${TARGETARCH}_10.18.0.tar.gz \
    && rm -rfv azcopy_linux_${TARGETARCH}_10.18.0/azcopy

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s \
  CMD curl -f 127.0.0.1:5858/ping || exit 1
ENTRYPOINT ["./start.sh", "docker"]

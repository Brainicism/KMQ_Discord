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
RUN apk add --no-cache mysql-client \
    bash \
    curl

COPY --from=mwader/static-ffmpeg:6.0 /ffmpeg /usr/local/bin/
COPY --from=mwader/static-ffmpeg:6.0 /ffprobe /usr/local/bin/

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
ENTRYPOINT ["./start.sh", "docker"]

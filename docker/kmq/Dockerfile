FROM node:16-alpine AS build

RUN apk add --no-cache git \
    python3 \
    make \
    g++ \
    autoconf \
    automake \
    libtool

WORKDIR /app

COPY yarn.lock package.json ./
RUN yarn install

COPY start.sh tsconfig.json ./
COPY src/ src/
RUN npx tsc

COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql_dumps/daisuki/bootstrap-audio.sql sql_dumps/daisuki/bootstrap-audio.sql
COPY sql/ sql/

# ================================================================= #
FROM node:16-alpine
RUN apk add --no-cache mysql-client \
    ffmpeg \ 
    bash

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
ENTRYPOINT ["./start.sh", "docker"]

FROM node:15-alpine AS build

RUN apk add --no-cache git \
    python \
    make \
    g++ \
    autoconf \
    automake \
    libtool

WORKDIR /app

COPY yarn.lock package.json ./
COPY start.sh tsconfig.json ./
COPY src/ src/
COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql_dumps/daisuki/bootstrap-audio.sql sql_dumps/daisuki/bootstrap-audio.sql
COPY sql/ sql/

RUN yarn install
RUN npx tsc

# ================================================================= #
FROM node:15-alpine
RUN apk add --no-cache mysql-client \
    ffmpeg \ 
    bash

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
ENTRYPOINT ["./start.sh", "docker"]

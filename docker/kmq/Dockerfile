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

RUN yarn install --production

COPY start.sh tsconfig.json ./
COPY src/ src/
COPY data/ data/
COPY migrations/ migrations/
COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql/ sql/

# ================================================================= #
FROM node:15-alpine
RUN apk add --no-cache mysql-client \
    ffmpeg \ 
    bash

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG START_TYPE
ENV START_TYPE=$START_TYPE
ENTRYPOINT ["npm", "run", "start"]

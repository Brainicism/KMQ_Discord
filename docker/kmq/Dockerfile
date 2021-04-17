FROM node:15-alpine AS build

WORKDIR /app
COPY src/ src/
COPY yarn.lock yarn.lock
COPY data/ data/
COPY migrations/ migrations/
COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY start.sh start.sh
COPY tsconfig.json tsconfig.json
COPY sql/ sql/

RUN apk add --no-cache git \
    python \
    make \
    g++ \
    libsodium-dev \
    autoconf \
    automake \
    libtool \
    nodejs

RUN yarn global add typescript
COPY package.json yarn.lock ./
RUN yarn install --production


# ================================================================= #
FROM node:15-alpine
RUN apk add --no-cache mysql-client \
    nodejs \
    ffmpeg \ 
    bash

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG START_TYPE
ENV START_TYPE=$START_TYPE
ENTRYPOINT ["npm", "run", "start"]

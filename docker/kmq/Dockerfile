FROM node:15-alpine AS build

WORKDIR /app

RUN apk add --no-cache git \
    python \
    make \
    g++ \
    libsodium-dev \
    autoconf \
    automake \
    libtool \
    nodejs

RUN npm install typescript -g

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

FROM node:15-alpine
RUN apk add --no-cache mysql-client \
    nodejs \
    ffmpeg

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG START_TYPE
ENV START_TYPE=$START_TYPE
ENTRYPOINT ["npm", "run", "start"]

FROM node:15-alpine

WORKDIR /app

RUN apk add --no-cache git \
    python \
    make \
    g++ \
    libsodium-dev \
    autoconf \
    automake \
    libtool \
    mysql-client \
    nodejs \
    ffmpeg

RUN npm install typescript -g

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

STOPSIGNAL SIGINT
ARG START_TYPE
ENV START_TYPE=$START_TYPE
ENTRYPOINT ["npm", "run", "start"]

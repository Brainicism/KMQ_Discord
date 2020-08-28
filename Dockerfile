FROM node:alpine as ts-build

WORKDIR /app
COPY . .
RUN apk add --no-cache git \
    python \
    make \
    g++ \
    libsodium-dev \
    autoconf \
    automake \
    libtool \
    nodejs
RUN npm install typescript -g && npm install --production && tsc
RUN mkdir ./temp && mv ./build ./temp/build && \
    cp -a ./data/. ./temp/build/data &&     \
    mv ./node_modules ./temp/node_modules;

FROM node:alpine as run

COPY --from=ts-build /app/temp /app
WORKDIR /app/build/src
RUN apk add --no-cache nodejs ffmpeg
ENV NODE_ENV production
CMD ["node", "./kmq.js"]

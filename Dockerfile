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

FROM node:alpine as run

COPY --from=ts-build /app/build /app/build
COPY --from=ts-build /app/node_modules /app/node_modules
COPY data /app/build/data
RUN apk add --no-cache nodejs ffmpeg
WORKDIR /app/build/src
ENV NODE_ENV production
CMD ["node", "./kmq.js"]

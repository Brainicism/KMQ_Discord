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
    nodejs

RUN npm install typescript -g

COPY package.json package-lock.json ./

RUN npm install

COPY . .

ENTRYPOINT ["npm", "run", "dev"]

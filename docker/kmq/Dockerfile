FROM node:15

WORKDIR /app

RUN apt-get update && apt-get install -y \
    mysql-client \
    python \
    libsodium-dev \
    nodejs \
    ffmpeg

RUN npm install typescript -g

COPY package.json package-lock.json ./

RUN npm install

COPY . .

ENTRYPOINT ["npm", "run", "dev"]

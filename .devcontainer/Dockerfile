FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:18-bullseye

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends git \ 
    python3 \
    make \
    g++ \
    autoconf \
    automake \
    libtool \
    mariadb-client \
    ffmpeg

RUN npm install -g yarn

RUN git config --global alias.co checkout
RUN git config --global alias.br branch
RUN git config --global alias.ci commit
RUN git config --global alias.st status
RUN mkdir /songs && chown node:node /songs

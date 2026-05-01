FROM mcr.microsoft.com/devcontainers/python:3.14-bookworm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && corepack prepare yarn@stable --activate

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    git make g++ autoconf automake libtool \
    mariadb-client ffmpeg \
    && rm -rf /var/lib/apt/lists/*


RUN mkdir /songs && chown vscode:vscode /songs

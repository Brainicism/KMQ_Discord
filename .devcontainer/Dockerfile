FROM mcr.microsoft.com/devcontainers/python:3.14-bookworm

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    git make g++ autoconf automake libtool \
    mariadb-client ffmpeg \
    && rm -rf /var/lib/apt/lists/*


RUN mkdir /songs && chown vscode:vscode /songs

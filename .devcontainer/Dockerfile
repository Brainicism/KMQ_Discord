FROM mcr.microsoft.com/devcontainers/python:3.14-bookworm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

// install node
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    corepack enable && corepack prepare yarn@stable --activate

// install other deps
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    git make g++ autoconf automake libtool \
    mariadb-client ffmpeg \
    && rm -rf /var/lib/apt/lists/*

// install cloudflared
RUN mkdir -p --mode=0755 /usr/share/keyrings \
    && curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null \
    && echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
    | tee /etc/apt/sources.list.d/cloudflared.list >/dev/null \
    && apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends cloudflared \
    && rm -rf /var/lib/apt/lists/*


RUN mkdir /songs && chown vscode:vscode /songs

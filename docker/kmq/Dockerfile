FROM node:22 AS build
ARG TARGETARCH

RUN apt-get update && apt-get install -y git \
  python3 \
  make \
  g++ \
  autoconf \
  automake \
  libtool \
  protobuf-compiler \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY yarn.lock package.json ./
RUN yarn global add node-gyp@10.2.0
RUN yarn install --frozen-lockfile
COPY start.sh tsconfig.json ./
COPY i18n/ i18n/
COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql_dumps/kmq-test-cached.sql sql_dumps/kmq-test-cached.sql
COPY sql/ sql/
COPY templates/ templates/

RUN mkdir -p bin/yt-dlp-plugins/yt-dlp-pot-provider
RUN curl -L https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o bin/yt-dlp
RUN chmod u+x bin/yt-dlp
RUN curl -L https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/1.2.2/bgutil-ytdlp-pot-provider.zip -o bgutil-ytdlp-pot-provider.zip && \
    unzip -q bgutil-ytdlp-pot-provider.zip -d bin/yt-dlp-plugins/bgutil-ytdlp-pot-provider && \
    rm bgutil-ytdlp-pot-provider.zip

COPY src/ src/
RUN npx tsc

# ================================================================= #
FROM node:22-slim
RUN apt-get update && apt-get install -y default-mysql-client \
  ffmpeg \
  curl \
  python3 \
  unzip \
  less \
  vim \
  jq \
  && rm -rf /var/lib/apt/lists/*


ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="$DENO_INSTALL/bin:$PATH"

COPY --from=build /app /app
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
HEALTHCHECK --start-interval=5s --interval=60s --timeout=3s --start-period=30s CMD bash src/healthcheck.sh
ENTRYPOINT ["./start.sh", "docker"]

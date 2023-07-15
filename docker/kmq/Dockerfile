FROM node:18 AS build
ARG TARGETARCH

RUN apt-get update && apt-get install -y git \
    python3 \
    make \
    g++ \
    autoconf \
    automake \
    libtool \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /binaries
RUN wget "https://azcopyvnext.azureedge.net/release20230331/azcopy_linux_${TARGETARCH}_10.18.0.tar.gz" \
    && tar xzfv azcopy_linux_${TARGETARCH}_10.18.0.tar.gz \
    && cp -fv azcopy_linux_${TARGETARCH}_10.18.0/azcopy /binaries \
    && chmod +x /binaries/azcopy \
    && rm azcopy_linux_${TARGETARCH}_10.18.0.tar.gz \
    && rm -rfv azcopy_linux_${TARGETARCH}_10.18.0

WORKDIR /app
COPY yarn.lock package.json ./
RUN yarn install --frozen-lockfile

COPY start.sh tsconfig.json ./
COPY i18n/ i18n/
COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql_dumps/kmq-test-cached.sql sql_dumps/kmq-test-cached.sql
COPY sql/ sql/
COPY templates/ templates/

COPY src/ src/
RUN npx tsc

# remove dev dependencies
RUN yarn install --production --ignore-scripts --prefer-offline
# ================================================================= #
FROM node:18-slim
RUN apt-get update && apt-get install -y default-mysql-client \
    ffmpeg \
    curl \
    unzip \
    less \
    vim \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app
COPY --from=build /binaries/azcopy /usr/bin/azcopy
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
HEALTHCHECK --interval=5s --timeout=3s --start-period=30s \
  CMD [ "$(cat status)" = "ready" ] && curl -f 127.0.0.1:5858/ping || exit 1
ENTRYPOINT ["./start.sh", "docker"]

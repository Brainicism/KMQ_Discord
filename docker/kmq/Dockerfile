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

WORKDIR /app
COPY yarn.lock package.json ./
RUN yarn global add node-gyp@9.4.0
RUN yarn install --frozen-lockfile

COPY start.sh tsconfig.json ./
COPY i18n/ i18n/
COPY sql_dumps/daisuki/bootstrap.sql sql_dumps/daisuki/bootstrap.sql
COPY sql_dumps/kmq-test-cached.sql sql_dumps/kmq-test-cached.sql
COPY sql/ sql/
COPY templates/ templates/

COPY src/ src/
RUN npx tsc

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
WORKDIR /app

STOPSIGNAL SIGINT
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
HEALTHCHECK --start-interval=5s --interval=60s --timeout=3s --start-period=30s \
  CMD [ "$(cat status)" = "ready" ] && curl -s -w "%{http_code}" -f 127.0.0.1:5858/ping || exit 1
ENTRYPOINT ["./start.sh", "docker"]

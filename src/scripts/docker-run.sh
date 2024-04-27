#!/bin/bash

source .env
WEB_SERVER_PORT=${WEB_SERVER_PORT:-5858}
echo "Preparing restart of $APP_NAME at port $WEB_SERVER_PORT..."
while true; do
    result=$(curl -s 127.0.0.1:$WEB_SERVER_PORT/session-count)

    if [ "$result" = "0" ]; then
        docker rm -f $APP_NAME
        npm run docker-run-internal
        break
    fi

    echo "$result session(s) are still active, waiting 10s..."
    sleep 10
done

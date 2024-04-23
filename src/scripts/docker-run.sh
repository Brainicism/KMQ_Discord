#!/bin/bash

source .env
PORT_NUMBER=${PORT_NUMBER:-5858}
echo "Preparing restart of $APP_NAME..."
result=$(curl -s 127.0.0.1:$PORT_NUMBER/session-count)
echo "$result session(s) are still active, waiting 10s..."
while true; do
    result=$(curl -s 127.0.0.1:$PORT_NUMBER/session-count)

    if [ "$result" -eq 0 ]; then
        docker rm -f $APP_NAME
        npm run docker-run-internal
        break
    fi

    echo "$result session(s) are still active, waiting 10s..."
    sleep 10
done

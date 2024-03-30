. ./.env && [ "$(cat status)" = "ready" ] && curl -s -w "%{http_code}" -f 127.0.0.1:$WEB_SERVER_PORT/ping || exit 1

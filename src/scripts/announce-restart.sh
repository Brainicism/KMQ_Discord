#!/bin/bash

# Load environment variables
source "$(dirname "$0")/../../.env"

# Parse options
RESTART=true
DOCKER_IMAGE=""
TIMER=5
PROVISIONING_TIMEOUT=15

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --no-restart) RESTART=false ;;
        --docker-image) DOCKER_IMAGE="$2"; shift ;;
        --timer) TIMER="$2"; shift ;;
        --provisioning-timeout) PROVISIONING_TIMEOUT="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

abort_restart() {
    echo "Aborting restart"
    curl -X POST "http://127.0.0.1:$WEB_SERVER_PORT/clear-restart" -H "Content-Type: application/json"
}

announce_restart() {
    local restart_minutes=$1
    local restart_date=$2
    local restart=$3

    curl -X POST "http://127.0.0.1:$WEB_SERVER_PORT/announce-restart" \
        -H "Content-Type: application/json" \
        -d "{\"restartMinutes\": $restart_minutes}"

    echo "Next $(if $restart; then echo "restart"; else echo "shutdown"; fi) scheduled at $restart_date"
    local end_time=$(date -d "$restart_date" +%s)
    while [[ $(date +%s) -lt $end_time ]]; do
        echo "Restarting in $((end_time - $(date +%s))) seconds"
        sleep 10
    done
}

delay() {
    sleep "$1"
}

server_shutdown() {
    local restart_minutes=$1
    local restart=$2
    local docker_image=$3
    local provisioning_timeout=$4

    if ! $restart; then
        local restart_date=$(date -d "+$restart_minutes minutes")
        announce_restart "$restart_minutes" "$restart_date" "$restart"

        sleep $(($restart_minutes * 60))
        echo "Stopping KMQ..."
        APP_NAME=$APP_NAME npm run docker-stop
    else
        local old_app_name="${APP_NAME}-old"
        echo "Upgrading KMQ..."
        echo "Renaming container..."
        docker rename "$APP_NAME" "$old_app_name"

        echo "Provisioning standby container with new image..."
        APP_NAME=$APP_NAME IMAGE_NAME=$docker_image IS_STANDBY=true npm run docker-run-internal

        local standby_provisioning=true
        local standby_create_time=$(date +%s)
        while $standby_provisioning; do
            local standby_status=$(docker exec "$APP_NAME" /bin/sh -c 'if [ -f "standby" ]; then cat standby; fi')
            echo "Standby Status: ${standby_status:-bootstrapping}"

            if [[ "$standby_status" == "ready" ]]; then
                standby_provisioning=false
            fi

            if [[ $(($(date +%s) - standby_create_time)) -gt $(($provisioning_timeout * 60)) ]]; then
                docker rm -f "$APP_NAME"
                docker rename "$old_app_name" "$APP_NAME"
                echo "Standby took too long to provision" >&2
                exit 1
            fi

            delay 1
        done

        local restart_date=$(date -d "+$restart_minutes minutes")
        announce_restart "$restart_minutes" "$restart_date" "$restart"

        echo "Dropping old primary..."
        docker rm -f "$old_app_name"

        echo "Promoting standby to primary..."
        docker exec "$APP_NAME" /bin/sh -c 'mv standby promoted'
    fi
}

trap abort_restart SIGINT

echo "Options: --timer $TIMER --provisioning-timeout $PROVISIONING_TIMEOUT --docker-image $DOCKER_IMAGE --no-restart $RESTART"
server_shutdown "$TIMER" "$RESTART" "$DOCKER_IMAGE" "$PROVISIONING_TIMEOUT"

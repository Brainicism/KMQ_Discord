#!/bin/bash
set -e

rebuild () {
    echo "Cleaning build..."
    npm run clean
    echo "Compiling typescript..."
    tsc
    cd build/
}
if [ "${NODE_ENV}" == "dry-run" ]; then
    rebuild
    echo "Starting bot..."
    exec node kmq.js
else
    echo "Bootstrapping..."
    npm run bootstrap
    echo "Starting bot..."
    if [ "${NODE_ENV}" == "development" ]; then
        cd src
        exec node -r ts-node/register --inspect=9229 kmq
    elif [ "${NODE_ENV}" == "production" ]; then
        rebuild
        git log -n 1 --pretty=format:"%H" > ../version
        exec node kmq.js
    fi
fi

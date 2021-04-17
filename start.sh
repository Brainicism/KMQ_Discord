#!/bin/bash
set -e

rebuild () {
    echo "Cleaning build..."
    npm run clean
    echo "Compiling typescript..."
    tsc
    cd build/
}
if [ "${START_TYPE}" == "dry-run" ]; then
    rebuild
    echo "Starting bot..."
    export NODE_ENV=dry-run 
    exec node kmq.js
else
    echo "Bootstrapping..."
    npm run bootstrap
    echo "Starting bot..."
    if [ "${START_TYPE}" == "dev" ]; then
        cd src
        export NODE_ENV=development
        exec node -r ts-node/register --inspect=9229 kmq
    elif [ "${START_TYPE}" == "prod" ]; then
        rebuild
        export NODE_ENV=production
        git log -n 1 --pretty=format:"%H" > ../version
        exec node kmq.js
    fi
fi

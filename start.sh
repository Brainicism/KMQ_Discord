#!/bin/bash
set -e

rebuild () {
    echo "Compiling typescript..."
    tsc
}
if [ "${NODE_ENV}" == "dry-run" ]; then
    rebuild
    echo "Starting bot..."
    cd build/
    exec node kmq.js
else
    rebuild
    echo "Bootstrapping..."
    node build/seed/bootstrap.js
    echo "Starting bot..."
    cd build/
    if [ "${NODE_ENV}" == "development" ]; then
        exec node --inspect=9229 kmq.js
    elif [ "${NODE_ENV}" == "production" ]; then
        git log -n 1 --pretty=format:"%H" > ../version
        exec node kmq.js
    fi
fi

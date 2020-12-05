#!/bin/bash
set -e

rebuild () {
    echo "Cleaning build..."
    rm -rf build/
    echo "Compiling typescript..."
    tsc
    cd build/
}
if [ $1 == "dry-run" ]; then
    rebuild
    echo "Starting bot..."
    export NODE_ENV=dry-run 
    exec node kmq.js
else
    # Wait for DB if DB_HOST is defined and non-empty.
    if [ ! -z "$DB_HOST" ]; then
        while ! mysqladmin ping -h"$DB_HOST" --silent; do
            echo "Waiting for mysql"
            sleep 1
        done
    fi

    echo "Bootstrapping..."
    npm run bootstrap
    echo "Starting bot..."
    if [ $1 == "dev" ]; then
        cd src
        export NODE_ENV=development
        exec node -r ts-node/register --inspect=9229 kmq
    elif [ $1 == "prod" ]; then
        rebuild
        export NODE_ENV=production
        exec node kmq.js
    fi
fi

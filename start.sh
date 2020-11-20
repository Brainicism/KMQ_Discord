#!/bin/bash
set -e

rebuild () {
    echo "Cleaning build..."
    rm -rf build/
    echo "Compiling typescript..."
    tsc
    echo "Copying assets..."
    cp -r src/assets build/assets
    cd build/ 
}
if [ $1 == "dry-run" ]; then
    rebuild
    echo "Starting bot..."
    NODE_ENV=dry-run node kmq.js
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
    if [ $1 == "dev" ]; then
        cd src 
        echo "Starting bot..."
        NODE_ENV=development node -r ts-node/register --inspect=9229 kmq
    elif [ $1 == "prod" ]; then
        echo "Starting bot..."
        rebuild
        NODE_ENV=production node kmq.js
    fi
fi

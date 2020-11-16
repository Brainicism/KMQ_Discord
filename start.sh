#!/bin/bash

rebuild () {
    echo "Cleaning build..."
    rm -rf build/
    echo "Compiling typescript..."
    tsc
    echo "Copying assets..."
    cp -r src/assets build/assets
    ln -s "$(pwd)"/data/news.md build/data/news.md
    ln -s "$(pwd)"/data/group_list.txt build/data/group_list.txt
    cd build/ 
}
if [ $1 == "dry-run" ]; then
    rebuild
    echo "Starting bot..."
    NODE_ENV=dry-run node kmq.js
else
    echo "Performing migrations..."
    npx knex migrate:latest --knexfile src/config/knexfile_kmq.js
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

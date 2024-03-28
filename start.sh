#!/bin/bash
set -e

rebuild () {
    echo "Compiling typescript..."
    npx tsc
}

RUN_ID=$(cat /proc/sys/kernel/random/uuid)

if [ "${MINIMAL_RUN}" != "true" ]; then
    echo "Bootstrapping..."
    npx ts-node --swc src/seed/bootstrap.ts
fi

# run with ts-node + swc, no transpile needed
if [ "${NODE_ENV}" == "development_ts_node" ]; then
    cd src/
    exec env RUN_ID=$RUN_ID npx ts-node --swc kmq.ts
fi

# transpile project
if [[ $1 == 'native' ]]
then
    echo "Killing running instances..."
    ps x | grep node | grep "${PWD}/" | grep -E "kmq\.js|cluster_manager\.js|kmq\.ts" | awk '{print $1}' | xargs kill &> /dev/null || echo "No running instances to kill"
    
    if [ "${NODE_ENV}" == "production" ]; then
        echo "Cleaning project..."
        npm run clean
        echo "Installing dependencies..."
        rm -rf node_modules/
        yarn install --frozen-lockfile
        git log -n 1 --pretty=format:"%H" > ../version
    fi
    rebuild
fi

echo "Starting bot in ${NODE_ENV}..."

cd build/
if [ "${NODE_ENV}" == "dry-run" ] || [ "${NODE_ENV}" == "ci" ]; then
    exec env RUN_ID=$RUN_ID node --trace-warnings "${PWD}/kmq.js"
    elif [ "${NODE_ENV}" == "development" ]; then
    exec env RUN_ID=$RUN_ID node --trace-warnings --inspect=9229 "${PWD}/kmq.js"
    elif [ "${NODE_ENV}" == "production" ]; then
    exec env RUN_ID=$RUN_ID node --trace-warnings "${PWD}/kmq.js"
fi

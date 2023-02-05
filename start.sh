#!/bin/bash
set -e

rebuild () {
    echo "Compiling typescript..."
    npx tsc
}

echo "Killing running instances..."
ps x | grep node | grep "${PWD}/" | egrep "kmq\.js|cluster_manager\.js|kmq\.ts" | awk '{print $1}' | xargs kill &> /dev/null || echo "No running instances to kill"

echo "Bootstrapping..."
npx ts-node  --swc src/seed/bootstrap.ts

echo "Starting bot in ${NODE_ENV}..."

# run with ts-node + swc, no transpile needed
if [ "${NODE_ENV}" == "development_ts_node" ]; then
    cd src/
    exec npx ts-node --swc kmq.ts
fi

# transpile project
if [[ $1 == 'native' ]]
then
    if [ "${NODE_ENV}" == "production" ]; then
        echo "Cleaning project..."
        npm run clean
        echo "Installing dependencies..."
        yarn install --frozen-lockfile
    fi
    rebuild
fi

cd build/
if [ "${NODE_ENV}" == "dry-run" ] || [ "${NODE_ENV}" == "ci" ]; then
    exec node --trace-warnings "${PWD}/kmq.js"
elif [ "${NODE_ENV}" == "development" ]; then
    exec node --trace-warnings --inspect=9229 "${PWD}/kmq.js"
elif [ "${NODE_ENV}" == "production" ]; then
    git log -n 1 --pretty=format:"%H" > ../version
    exec node --trace-warnings "${PWD}/kmq.js"
fi

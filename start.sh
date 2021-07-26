#!/bin/bash
set -e

rebuild () {
    echo "Compiling typescript..."
    npx tsc
}

if [[ $1 == 'native' ]]
then
    rebuild
fi

echo "Bootstrapping..."
node build/seed/bootstrap.js
echo "Starting bot..."
cd build/
if [ "${NODE_ENV}" == "dry-run" ] || [ "${NODE_ENV}" == "ci" ]; then
    exec node cluster_manager.js
elif [ "${NODE_ENV}" == "development" ]; then
    exec node --inspect=9229 cluster_manager.js
elif [ "${NODE_ENV}" == "production" ]; then
    git log -n 1 --pretty=format:"%H" > ../version
    exec node cluster_manager.js
fi

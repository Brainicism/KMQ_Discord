#!/bin/bash
set -e

rebuild () {
    echo "Compiling typescript..."
    npx tsc
}
rebuild
echo "Bootstrapping..."
node build/seed/bootstrap.js
echo "Starting bot..."
cd build/
if [ "${NODE_ENV}" == "dry-run" ] || [ "${NODE_ENV}" == "ci" ]; then
    exec node kmq.js
elif [ "${NODE_ENV}" == "development" ]; then
    exec node --inspect=9229 kmq.js
elif [ "${NODE_ENV}" == "production" ]; then
    git log -n 1 --pretty=format:"%H" > ../version
    exec node --optimize_for_size kmq.js
fi

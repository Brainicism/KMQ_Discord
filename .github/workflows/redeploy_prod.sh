#!/bin/bash
restart_type=$1
kmq_dir=$2
docker_image=$3
cd $2

echo "git fetch"
git fetch -all

echo "Checking out prod branch"
git reset --hard origin/prod
git checkout prod

echo "Pulling latest prod changes"
git pull

echo "Latest commit:"
git log -n 1 --pretty

echo "Initiating restart"

if [ ! -z "$docker_image" ]; then
    npx ts-node src/scripts/announce-restart.ts --docker-image=$docker_image
elif [ "$restart_type" == "soft" ]; then
    npx ts-node src/scripts/announce-restart.ts --soft-restart
else
    npx ts-node src/scripts/announce-restart.ts
fi

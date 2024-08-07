#!/bin/bash
set -e
kmq_dir=$1
docker_image=$2
cd $1

echo "git fetch"
git fetch --all

echo "Checking out prod branch"
git reset --hard origin/prod
git checkout prod

echo "Pulling latest prod changes"
git pull

echo "Latest commit:"
git log -n 1 --pretty

echo "Initiating restart"
bash src/scripts/announce-restart.sh --docker-image $docker_image --timer 3 --provisioning-timeout 15

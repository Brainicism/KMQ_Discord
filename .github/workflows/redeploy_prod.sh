#!/bin/bash
cd /home/kmq/prod

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
npx ts-node src/scripts/announce-restart.ts

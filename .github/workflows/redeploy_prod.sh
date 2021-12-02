#!/bin/bash
cd /home/kmq/prod
git fetch
git checkout prod
git pull
/home/kmq/.nvm/versions/node/v14.2.0/bin/npx ts-node src/scripts/announce-restart.ts

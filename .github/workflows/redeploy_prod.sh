#!/bin/bash
cd /home/kmq/prod
git fetch
git checkout prod
git pull
ts-node src/scripts/announce-restart.ts

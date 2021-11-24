#!/bin/bash
cd /home/kmq/prod
git checkout prod
git pull
ts-node src/scripts/announce-restart.ts

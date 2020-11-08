#!/bin/bash

filenames[0]='./src/commands/game_commands/*.ts'
filenames[1]='./src/commands/game_options/*.ts'
exceptions=("debug")

for command_path in ${filenames[@]}
do
    command=$(basename $command_path .ts)

    if grep -q $command <<< "${exceptions[@]}"
    then
        continue
    fi
    
    if grep -Fq ",$command" GAMEPLAY.md; then
        echo "Documentation for '$command' found in GAMEPLAY.md"
    else
        echo "Documentation for '$command' not found in GAMEPLAY.md"
        exit 1
    fi
done
exit 0

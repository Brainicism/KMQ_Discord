game_commands=`ls ./src/commands/game_commands`
for command in $game_commands
do
    if grep -Fq ",$(basename $command .ts)" GAMEPLAY.md; then
        echo "Documentation for '$command' found in GAMEPLAY.md"
    else
        echo "Documentation for '$command' not found in GAMEPLAY.md"
        exit 1
    exit 0
    fi
done

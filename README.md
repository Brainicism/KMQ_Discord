K-pop Music Quiz
=======

A kpop game in Discord, using [Aoimirai's database](http://www.aoimirai.net/kpop/index.html) of songs. Test your reflexes by guessing the right song name before your friends!

Join our [support server](https://discord.gg/RCuzwYV) for help and to play with us! We're open to feature requests/bug reports too!

[![Discord Bots](https://top.gg/api/widget/508759831755096074.svg)](https://top.gg/bot/508759831755096074)



# Gameplay
Gameplay is initiated via `,play`, which invites the bot to a voice channel. The bot will begin to play a random kpop song based on the game options. Users can guess the song by typing the name of the song. 

![scoreboard](/images/scoreboard.png)

# Commands 
## General Commands 
- `,play`: Begin a game of KMQ. The bot will play a random song based on the currently chosen filters. Users are able to guess the name of the song by typing it in the chat. You will receive a point if you are the first correct guesser
- `,end`: Stop the current game of KMQ. The bot will display the winner of the game.
- `,skip`: Starts a vote to skip the current playing song. Based on majority rule.
- `,options`: Shows the current game options, which filter the songs that will be played
- `,help`: Shows a general overview of available commands, as well as specific instructions for each command
- `,prefix`: Specifies the bot's prefix
- `,news`: Show the latest features/changes to the bot


## Game Option Commands 
- `,cutoff`: Set a cutoff year for songs. Only songs released during and after the cutoff year will be chosen.
- `,limit`: Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters.
- `,gender`: Choose the gender of the artists you'd like to hear from.
- `,seek`: Choose whether each songs starts from the beginning, or a random point.
- `,volume`: Specifies the volume at which songs are played
- `,groups`: Specify what groups/artists you'd like to hear from

![options](/images/game_options.png)

Full command list can always be found using `,help`

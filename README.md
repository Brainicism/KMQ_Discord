K-pop Music Quiz
=======

A kpop game in Discord, using [Aoimirai's database](http://www.aoimirai.net/kpop/index.html) of songs. Test your reflexes by guessing the right song name before your friends!

[![Discord Bots](https://top.gg/api/widget/508759831755096074.svg)](https://top.gg/bot/508759831755096074)

# Instructions
## Prerequisites
- MySQL (tested on 5.7)
    - add `sql-mode=""` under `[mysqld]` in `my.cnf` (required due to the way the Aoimirai database dump handles null values)
- NodeJS (Requires at least v12)

## Setup
------------
1. Create `config.json` based on the template provided
2. `npm install` to install Node dependeices
3. `npm run seed` to seed MySQL database with latest data
4. `npm start` to start the K-pop Music Quiz bot

# Gameplay
Gameplay is initiated via `,random`, which invites the bot to a voice channel. The bot will begin to play a random kpop song based on the game options. Users can guess the song by typing the name of the song. 

![alt text](/images/scoreboard.png)

Supported game options include:
- `cutoff`: Set a cutoff year for songs. Only songs released during and after the cutoff year will be chosen.
- `limit`: Set a maximum number of results in the song query. This effectively sets the 'Top X number of songs' based on the selected filters.
- `gender`: Choose the gender of the artists you'd like to hear from.

Full command list can be found using `,help`

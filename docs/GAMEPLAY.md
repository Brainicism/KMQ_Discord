[Click here to join our official server!](https://discord.gg/R55g4CRESW)

You can invite the bot [here](https://discord.com/oauth2/authorize?client_id=508759831755096074&scope=bot&permissions=3501120).

Welcome to KMQ, the K-Pop song guessing game. Type `,play` while in a voice channel to begin a game of KMQ! The bot will automatically start playing a random song, and the first person to type in the correct guess will win a point.

Use `,options` to see all the options you can change to make your perfect game!

Get a hint for the current song using `,hint`.

Start a vote to skip the current song using `,skip`.

A game of KMQ can be ended by typing `,end`, and a winner will be announced.

See the latest updates to KMQ with `,news`.

We update our songs frequently! Expect to see songs on the bot the same day they release on YouTube!

# Sections
* [EXP System](#exp-system)
* [Game Options](#game-options)
* [Game Modes](#game-modes)
* [Presets](#presets)
* [Full Command List](#full-command-list)

![guess_song](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/guess_song.png)


# EXP System
Think you have what it takes to be a KMQ master? Rise through the ranks, gaining EXP and leveling up by playing KMQ. Every correct guess will net you some EXP, increasing based on your game options. The higher the number of songs selected by your game options, the more EXP you will get! 

Everyone starts off as a `Novice` and works their way up as a `Trainee` (Level 10), `Pre-debut` (Level 20), `Nugu` (Level 30), and many more! Check out `,profile` and `,scoreboard` to see where you and other players stand!

## EXP Modifiers
- Playing with more people will increase how much EXP you gain, ranging between 0.75x (single player) to 1.25x EXP (6+ players)
- Guessing quickly will earn you 1.1x EXP
- Guess streaks greater than 5 will earn you 1.2x EXP
- Voting on [top.gg](https://top.gg/bot/508759831755096074/vote) rewards you 2x EXP for an hour. You can vote once every 12 hours. See `,vote` for more details
- Every weekend is a 2x EXP weekend! Available all day on Saturdays and Sundays EST time
- On weekdays, there are 3 daily `KMQ Power Hours` lasting two hours each for 2x EXP at random points of the day
- Winning a game in teams mode earns your team 1.1x EXP
- Using a hint reduces EXP by 0.5x
- All EXP bonuses stack on one another

## Requirements
You will only gain EXP if:
- There are a minimum of 10 songs selected
- You are using `,guessmode song` (full EXP)
- You are using `,guessmode artist` or `,mode both` and are not using `,groups` (30% EXP)


# Game Options
KMQ offers different game options to dynamically narrow down the selection of songs based on your preferences. The current game options can be viewed by using `,options` or simply tagging KMQ Bot.

Use `,help [command_name]` for details and examples for every bot command.

For each command's usage, arguments:
- surrounded by `[brackets]` are required
- surrounded by `{curly_brackets}` are optional
- containing `[values | separated | by | pipes]` are the only valid argument values (in this case, only `values`, `separated`, `by`, and `pipes` would be accepted)

**If no arguments are passed, the game option is reset to its original value.** To reset all options, use `,reset`.

![options](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/options.png)

When applying a new game option, the newly updated option will be bold in the bot's response. To learn more about how to use a specific game option, check `,help [option]`.

## ,limit [beginning_limit] {end_limit}
Setting this option "limits" KMQ bot to the **top most viewed** `beginning_limit` **music videos** out of the total number of songs. Increasing the limit allows less popular songs to play; decreasing it restricts it to more popular songs.

For example, `,limit 100` will play the 100 most viewed songs in the current game options, while `,limit 250 500` will play between the 250th and 500th most viewed songs.

View counts are frequently updated from YouTube.

![limit](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/limit.png)

## ,groups [group_1], {group_2}, {group_3} ...
Setting the groups option limits the selection of songs to those belonging to the artist specified. For instance `,groups blackpink, itzy, fromis 9, bts` will exclusively play songs from those four artists. You can view the list of groups names via the link in `,help groups`. **Make sure to separate the groups with commas**.

* List all set groups using `,list groups`
* Add groups using `,add groups [group_1], {group_2}, ...`
* Remove groups using `,remove groups [group_1], {group_2}, ...`
* In order to reset this option, simply type `,groups`

![groups](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/groups.png)

## ,gender [gender_1 | alternating] {gender_2} {gender_3}
Setting a gender specifies the gender of the groups you'd like to hear from.

* `,gender male` will play songs by boy groups and male soloists
* `,gender female` will play songs by girl groups and female soloists
* `,gender male female` will play songs by boy groups, girl groups, and all soloists
* `,gender coed` will play songs by groups containing a mix of male and female members
* `,gender alternating` will alternate between `male` and `female` artist songs each round

`male`, `female`, and `coed` can all be used at once (`,gender male female coed`), but `alternating` must be used on its own.

Note that `,groups` and `,gender` are incompatible with each other. If you wish to continue using `,gender`, reset `,groups` first. 

Want to control whether groups or soloists are exclusively played? Check out `,help artisttype`.

![gender](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/gender.png)

## ,cutoff [beginning_year] {end_year}
Setting a cutoff limits songs based on which year they were released. Using `,cutoff 2015` will play songs from 2015 onwards, while `,cutoff 2015 2017` will play songs released between 2015 and 2017. 

![cutoff](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/cutoff.png)

## ,seek [seek_type]
Setting the seek type changes which point in a song the bot starts playing from.

* `,seek beginning` will play every song starting from the beginning
* `,seek random` will play from a random point in the song
* `,seek middle` will play from the middle of the song

![seek](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/seek.png)

## ,guessmode [guess_mode_type]
Setting the guess mode changes the objective of the game to guessing the name of the song, the artist, or both.

* `,guessmode song` only accepts song names as guesses
* `,guessmode artist` only accepts artist names as guesses
* `,guessmode both` accepts either the song or artist name
    * A song guess will net you 1 point and an artist guess will net you 0.2 points

![guessmode](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/guessmode.png)

## ,exclude [group_1], {group_2}, {group_3} ...
Setting the exclude option ignores songs by the specified artists. For instance `,exclude Day6, Momoland` ignore songs by those two artists. You can view the list of groups names via the link in `,help exclude`. **Make sure to separate the groups with commas**.

* List all set excluded groups using `,list exclude`
* Add excluded groups (these artist won't play) using `,add exclude [group_1], {group_2}, ...`
* Remove excluded groups (these artists will play) using `,remove exclude [group_1], {group_2}, ...`
* In order to reset this option, simply type `,exclude`

Similarly, to force groups in to the game regardless of the current options, use `,include`.

![exclude](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/exclude.png)

## ,goal [goal]
Setting the goal ends the game when the given goal score is reached. For example, if a player were to use `,goal 50`, the first player to 50 points would win the game (`,end` is called automatically).

To disable a goal, use `,goal`.

![goal](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/goal.png)

## ,timer [time (seconds)]
Setting a timer limits players to guess in under `time` seconds before the round ends automatically. Once a user gives a valid timeout, the timer will start at the beginning of every round. If no one guesses right in the allotted time, the round is over.

Set the timer to 10 (5? 3?) seconds and face off with your friends to see who the ultimate KMQ champ is!

Alternatively, set it above 30 seconds and avoid the `,skip` spam.

To disable a timer, use `,timer`.

![timer](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/timer.png)

## ,shuffle [random | unique]
Setting the `,shuffle unique` plays through every song in your options once before any are repeated.

With `,shuffle random`, songs are randomly chosen from before every round, so some may repeat depending on the total amount of songs.

![shuffle](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/shuffle.png)


# Presets
Want to store a set of options and be able to load them with one command? Use `,presets`!

## ,preset save [preset_name]
Save the current options as a preset called `preset_name`.

## ,preset export [preset_name]
Return a preset identifier (`KMQ-XXXXX-...`) that can be used to load or import the mentioned preset in other servers.

## ,preset load [preset_name | preset_identifier]
Load the mentioned preset or exported preset identifier into the game options.

## ,preset import [preset_identifier] [preset_name]
Create a new preset with name `preset_name` using a preset identifier.

## ,preset replace [preset_name]
Replace the mentioned preset's options with the current game options.

## ,preset delete [preset_name]
Delete the mentioned preset.

## ,preset list
List all of the server's presets.

![preset](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/preset.png)


# Game Modes
Getting tired of classic KMQ? Try out elimination and teams mode!

## ,play elimination x
See who can survive the longest into a KMQ game with elimination mode. Using `,play elimination x`, everyone starts with `x` lives; the last one alive wins! Guessing correctly will save your life while everyone else loses one.

Use elimination mode in conjunction with `,timer` to raise the pressure!

![elimination](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/elimination.png)

## ,play teams
Team up with your friends and crush the competition with teams mode! Split up into as many teams as you'd like and see who will emerge triumphant in the battle for 10% more EXP! Once your team is confident of its abilities, join the [official KMQ server](https://discord.gg/R55g4CRESW) to face-off with the best of the best.

To keep things fair, switching teams mid-game forfeits your current points and EXP.

![teams](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/teams.png)


# Full Command List
Use `,help [command_name]` for more details for any of the following commands:

## General Commands 
- `,play`: Begin a game of KMQ. The bot will play a random song based on the currently chosen filters
- `,end`: Stop the current game of KMQ. The bot will display the winner of the game
- `,hint`: Show a hint for the current song playing
- `,forcehint`: The person that started the game can force-hint the current song, no majority necessary
- `,skip`: Start a vote to skip the current playing song. Based on majority rule
- `,forceskip`: The person that started the game can force-skip the current song, no majority necessary
- `,options`: Show the current game options, which filter the songs that will be played
- `,help`: Show a general overview of available commands, as well as specific instructions for each command
- `,news`: Show the latest features/changes to the bot
- `,profile`: Show per-player stats, along with a ranking against everyone else
- `,leaderboard`: Show the server/game/global KMQ leaderboard
- `,list`: Show the currently selected groups for `,groups`, `,include`, or `,exclude`
- `,preset`: Quickly save, load, and export game options as presets (even across servers!)
- `,vote`: Show your current 2x bonus EXP modifier status from voting for the bot on [top.gg](https://top.gg/bot/508759831755096074/vote). Thanks for supporting KMQ!

## Game Option Commands 
- `,limit`: Set a maximum number of results in the song query. This effectively sets the "top `x` number of songs" based on the selected filters
- `,groups`: Specify which groups/artists to exclusively play from
- `,gender`: Choose the gender of the artists to exclusively play from
- `,cutoff`: Set a cutoff year for songs. Only songs released during and after the cutoff year will be chosen
- `,artisttype`: Choose whether to hear from soloists, groups, or both. 
- `,release`: Specify whether only official releases are played, or include b-sides + dance practices + acoustic versions + remixes
- `,language`: Choose whether to include Japanese/English/Chinese songs, or only Korean songs
- `,subunits`: Choose whether to automatically include a group's subunits when using `,groups`
- `,ost`: Include, exclude, or exclusively play OST music videos
- `,multiguess`: Choose whether to allow multiple players to guess correctly in a round
- `,shuffle`: Choose whether songs should play in "true" random order or in uniquely random order.
- `,seek`: Choose whether each song starts from the beginning, middle, or a random point
- `,guessmode`: Choose whether to guess based on song name, artist name, or both
- `,goal`: Specify a number of points to be reached before a winner is selected and the game ends 
- `,timer`: Specify how many songs each songs played before it's automatically skipped
- `,duration`: Set the maximum length of a KMQ game in minutes
- `,exclude`: Specify which artists to exclude
- `,include`: Specify which artists to forcefully include, regardless of other game options

- `,reset`: Reset all options to the default settings
- `,add`: Add groups to `,groups`, `,exclude`, or `,include`
- `,remove`: Remove groups to `,groups`, `,exclude`, or `,include`

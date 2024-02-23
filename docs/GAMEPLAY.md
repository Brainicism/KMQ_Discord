# K-pop Music Quiz

## [Click here to join our official Discord server!](https://discord.gg/R55g4CRESW)

## [You can invite the bot here.](http://invite.kpop.gg)

Welcome to KMQ, the K-Pop song guessing game. Type `/play` while in a voice channel to begin a game of KMQ! The bot will automatically start playing a random song, and the first person to type in the correct guess will win a point.

Use `/options` to see all the options you can change to make your perfect game!

Get a hint for the current song using `/hint`.

Start a vote to skip the current song using `/skip`.

`/end` a game of KMQ and the bot will announce a winner.

See the latest updates to KMQ with `/news`.

To reset all options, use `/reset`.

Learn more about the bot's commands with `/help`.

Change the language between English, 한국어, 日本語, Français, 中文, and Español with `/locale`.

We update our songs frequently! Expect to see songs on the bot the same day they release on YouTube!

# Sections

-   [EXP System](#exp-system)
-   [Game Options](#game-options)
-   [Game Modes](#game-modes)
-   [Presets](#presets)
-   [Full Command List](#full-command-list)

![guess_song](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/guess_song.png)

# EXP System

Think you have what it takes to be a KMQ pro? Rise through the ranks, gaining EXP and leveling up by playing KMQ. Every correct guess will net you some EXP, increasing based on your game options. The higher the number of songs selected by your game options, the more EXP you will get!

Everyone starts off as a `Novice` and works their way up as a `Trainee` (Level 10), `Pre-debut` (Level 20), `Nugu` (Level 30), and more! Check out `/profile` and `/leaderboard` to see where you and other players stand!

## EXP Modifiers

-   Playing with more people will increase how much EXP you gain, ranging between 1x (single player) to 1.5x EXP (6+ players)
-   Guessing fast (within 1 second) will earn you 1.1x EXP
-   Guess streaks greater than 5 will earn you 1.2x EXP
-   Voting on [top.gg](https://top.gg/bot/508759831755096074/vote) rewards you 2x EXP for an hour. You can vote once every 12 hours. See `/vote` for more details
-   Every weekend is a 2x EXP weekend! Available all day on Saturdays and Sundays EST time
-   On weekdays, there are 3 daily `KMQ Power Hours` lasting two hours each for 2x EXP at random points of the day
-   Winning a game in teams mode earns your team 1.1x EXP
-   Using a hint reduces EXP by 0.5x
-   All EXP bonuses stack on one another
-   Playing on multiple choice mode reduces EXP by (0.25x, 0.5x, 0.75x) based on difficulty
-   Rounds will randomly have rare EXP bonuses of 2x, 5x, 10x, and 50x!

## Requirements

You will only gain EXP if:

-   There are a minimum of 10 songs selected
-   You are using `/guessmode set guessmode:song` (full EXP)
-   You are using `/guessmode set guessmode:artist` or `/guessmode set guessmode:both` and are not using `/groups` (30% EXP)

# Game Options

KMQ offers different game options to dynamically narrow down the selection of songs based on your preferences. The current game options can be viewed by using `/options` or tagging KMQ Bot.

Use `/help action:[command_name]` for details and examples for every bot command.

![options](https://raw.githubusercontent.com/Brainicism/KMQ_Discord/master/images/options.png)

When applying a new game option, the newly updated option will be bold in the bot's response.

## /limit

Setting this option "limits" KMQ bot to the **top most viewed music videos** out of the total number of songs. Increasing the limit allows less popular songs to play; decreasing it restricts it to more popular songs.

For example, `/limit set top limit:100` will play the 100 most viewed songs in the current game options, while `/limit set range limit_start:250 limit_end:500` will play between the 250th and 500th most viewed songs.

View counts are frequently updated from YouTube.

## /groups

Setting the groups option limits the selection of songs to those belonging to the artist specified. For instance `/groups set group_1:blackpink group_2:itzy group_3:fromis 9 group_4:bts` will exclusively play songs from those four artists. You can view the list of groups names via the link in `/help action:groups`.

-   List all set groups using `/list type:groups`
-   Add groups using `/groups add`
-   Remove groups using `/groups remove`
-   To reset this option, type `/groups reset`

## /gender

Setting a gender specifies the gender of the groups you'd like to hear from.

-   `/gender set gender_1:male` will play songs by boy groups and male soloists
-   `/gender set gender_1:female` will play songs by girl groups and female soloists
-   `/gender set gender_1:male gender_2:female` will play songs by boy groups, girl groups, and all soloists
-   `/gender set gender_1:coed` will play songs by groups containing a mix of male and female members
-   `/gender set gender_1:alternating` will alternate between `male` and `female` artist songs each round

`male`, `female`, and `coed` can all be used at once (`/gender set gender_1:male gender_2:female gender_3:coed`), but `alternating` must be used on its own.

Note that `/groups` and `/gender` are incompatible with each other. If you wish to continue using `/gender`, reset `/groups` first.

Want to control whether groups or soloists are exclusively played? Check out `/help action:artisttype`.

## /cutoff

Setting a cutoff limits songs based on which year they were released. Using `/cutoff set earliest beginning_year:2015` will play songs from 2015 onwards, while `/cutoff set range beginning_year:2015 ending_year:2017` will play songs released between 2015 and 2017.

## /seek

Setting the seek type changes which point in a song the bot starts playing from.

-   `/seek set seek:beginning` will play every song starting from the beginning
-   `/seek set seek:random` will play from a random point in the song
-   `/seek set seek:middle` will play from the middle of the song

## /guessmode

Setting the guess mode changes the objective of the game to guessing the name of the song, the artist, or both.

-   `/guessmode set guessmode:song` only accepts song names as guesses
-   `/guessmode set guessmode:artist` only accepts artist names as guesses
-   `/guessmode set guessmode:both` accepts either the song or artist name
    -   A song guess will net you 1 point and an artist guess will net you 0.2 points

## /exclude

Setting the exclude option ignores songs by the specified artists. For instance `/exclude set group_1:Day6 group_2:Momoland` ignore songs by those two artists. You can view the list of groups names via the link in `/help exclude`.

-   List all set excluded groups using `/list type:exclude`
-   Add excluded groups (these artists won't play) using `/exclude add`
-   Remove excluded groups (these artists will play) using `/exclude remove`
-   To reset this option, type `/exclude reset`

Similarly, to force groups in to the game regardless of the current options, use `/include`.

## /goal

Setting the goal ends the game when the given goal score is reached. For example, if a player were to use `/goal set score:50`, the first player to 50 points would win the game.

## /timer

Setting a timer limits players to guess in under `time` seconds before the round ends automatically. If no one guesses right in the allotted time, the round is over.

Set the timer to 10 (5? 3?) seconds and face off with your friends to see who the ultimate KMQ champ is, or set it to 30 seconds and avoid the `/skip` spam.

# Presets

Want to store a set of options and be able to load them with one command? Use `/presets`!

## /preset save

Save the current options as a new preset.

## /preset export

Get a preset identifier used to load or import the preset in other servers.

## /preset load

Load the given preset into the game options.

## /preset import

Create a new preset from a preset identifier.

## /preset replace

Update a preset with the current game options.

## /preset delete

Delete a preset.

## /preset list

List all the server's presets.

# Game Modes

Getting tired of classic KMQ? Try out elimination, teams, and hidden mode!

## /play elimination

See who can survive the longest into a KMQ game with elimination mode. Guessing correctly will save your life while everyone else loses one. Use elimination mode in conjunction with `/timer` to raise the pressure!

## /play teams

Team up with your friends and crush the competition with teams mode! Split up into as many teams as you'd like and see who will emerge triumphant in the battle for 10% more EXP! Once your team is confident of its abilities, join the [official KMQ server](https://discord.gg/R55g4CRESW) to face-off with the best of the best.

To keep the game fair, switching teams mid-game forfeits your current points and EXP.

## /play hidden

Instead of guessing in chat, `/guess` directly to the bot. Everyone can take their time to think out what song is playing before the timer ends.

## /play suddendeath

Everyone shares one life! If you can't guess the song in time, the game ends. No hints, no skips, no second chances.

# Full Command List

Use `/help action:[command_name]` for more details about the following commands:

## General Commands

-   `/play`: Begin a game of KMQ. The bot will play a random song based on the chosen filters
-   `/end`: Stop the current game of KMQ. The bot will display the winner of the game
-   `/hint`: Show a hint for the current song playing
-   `/forcehint`: The person that started the game can force-hint the current song, no majority necessary
-   `/skip`: Start a vote to skip the current playing song. Based on majority rule
-   `/forceskip`: The person that started the game can force-skip the current song, no majority necessary
-   `/options`: Show the current game options, which filter the songs that will be played
-   `/help`: Show a general overview of available commands, as well as specific instructions for each command
-   `/botnews`: Show the latest features/changes to the bot
-   `/profile`: Show per-player stats, along with a ranking against everyone else
-   `/leaderboard`: Show the server/game/global KMQ leaderboard
-   `/score`: Show the current game's scoreboard with EXP gained
-   `/list`: Show the currently selected groups for `/groups`, `/include`, or `/exclude`
-   `/preset`: Quickly save, load, and export game options as presets (even across servers!)
-   `/vote`: Show your current 2x bonus EXP modifier status from voting for the bot on [top.gg](https://top.gg/bot/508759831755096074/vote)
-   `/recentlyadded`: See a list of songs added to KMQ in the past 2 weeks
-   `/exp`: Show your current bonus EXP modifiers
-   `/locale`: Change the language of the bot
-   `/lookup`: Get information about the given song (whether it's available in KMQ, aliases, etc.)
-   `/upcomingreleases`: See a list of confirmed songs, albums, and EPs planned for release in the future
-   `/guess`: Guess the name of the current song or artist when using `/play hidden`
-   `/news`: Get a summary of the latest K-pop news from the internet!

## Game Option Commands

-   `/limit`: Set a maximum number of results in the song query. This effectively sets the "top `x` number of songs" based on the selected filters
-   `/groups`: Specify which groups/artists to exclusively play from
-   `/gender`: Choose the gender of the artists to exclusively play from
-   `/answer`: Choose whether to type in your answer (and allow typos), or to pick from multiple choices on buttons
-   `/cutoff`: Set a cutoff year for songs. Only songs released during and after the cutoff year will be chosen
-   `/playlist`: Play songs from a Spotify/YouTube playlist
-   `/artisttype`: Choose whether to hear from soloists, groups, or both
-   `/release`: Specify whether official releases are played, or to include b-sides, dance practices, acoustic versions, and remixes
-   `/language`: Choose whether to include Japanese/English/Chinese songs, or only Korean songs
-   `/subunits`: Choose whether to automatically include a group's subunits when using `/groups`
-   `/ost`: Include, exclude, or exclusively play OST music videos
-   `/remix`: Include or exclude remixed songs
-   `/multiguess`: Choose whether to allow multiple players to guess correctly in a round
-   `/shuffle`: Choose whether songs should play in random order, or based on popularity
-   `/seek`: Choose whether each song starts from the beginning, middle, or a random point
-   `/special`: Modify how each song sounds, such as playing it in reverse, changing its pitch, etc.
-   `/guessmode`: Choose whether to guess based on song name, artist name, or both
-   `/goal`: Specify how many points to reach before a winner is selected and the game ends
-   `/timer`: Specify how many seconds each song is played before it's automatically skipped
-   `/duration`: Set the maximum length of a KMQ game in minutes
-   `/exclude`: Specify which artists to exclude
-   `/include`: Specify which artists to forcefully include, regardless of other game options
-   `/reset`: Reset all options to the default settings
-   `/feedback`: Submit feedback to the KMQ team

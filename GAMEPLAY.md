Gameplay
=======
Welcome to KMQ, the K-Pop song guessing game. Type `,play` while in a voice channel to begin a game of KMQ! The bot will automatically start playing a random song, and the first person to type in the correct guess will win a point. 

![guess_song](/images/guess_song.png)

You can see the current scoreboard by typing `,score`. It is also shown after the end of each round. A song can be skipped by using `,skip`, which will skip the song once a majority of participants do the same.  A game of KMQ can be ended by typing `,end`, and a winner will be announced.

See the latest updates to KMQ with `,news`. 

# Game Options
KMQ offers different game options to narrow down the selection of random songs based on your preferences. The current game options can be viewed by using `,options` or simply tagging KMQ Bot.

![options](/images/options.png)

The highlighted text indicates values that can be changed via game options. The underlined text indicates the total amount of songs, narrowed down by the selected game options.

When applying a new game option, the newly updated option will be bolded in the bot's response. To learn more about how to use a specific game option command, check `,help [command_name]`.

## ,limit [x]
Setting a limit 'limits' KMQ bot to the top most viewed `x` music videos out of the total number of songs (the number underlined in `,options`). Increasing this value allows for less popular songs to play, while decreasing it restricts it to more popular songs.

![limit](/images/limit.png)

## ,gender [gender_1] {gender_2} {gender_3}
Setting a gender specifies the gender of the groups you'd like to hear from. For instance, `,gender male` would only play songs by boy groups. `,gender male female` would play song by both boy and girl groups. `,gender coed` refers to groups that contain a mix of male and female members. 

![gender](/images/gender.png)

## ,cutoff [beginning_year] {end_year}
Setting a cutoff limits songs based on which year they were released. Using `,cutoff 2015` would play songs from 2015 onwards. `,cutoff 2015 2017` would only play songs released between 2015 and 2017. 

![cutoff](/images/cutoff.png)

## ,seek [seek_type]
Setting the seek type changes at which point in a song KMQ bot starts playing from. `,seek beginning` would make KMQ bot play every song starting from the beginning. `,seek random` would play from a random point in the song.

![seek](/images/seek.png)

## ,volume [volume_level]
Setting the volume changes how loud the bot is. `,volume 65` would change the volume to 65%.

![volume](/images/volume.png)

## ,mode [mode_type]
Setting the mode type changes the objective of the game, between guessing the name of the artist (`,mode artist`) vs guessing the name of the song (`,mode song`). 

![mode](/images/mode.png)

## ,groups [group_1],{group_2},{group_3} ...
Setting the groups option limits the selection of songs to those belonging to the artist specified. For instance `,groups blackpink,itzy,bts` would exclusively play songs from those three artists. You can view the list of groups with `,help groups`. Make sure to separate the groups with commas. You must enter the names of all of the groups at one time. In order to reset this option, simply type `,groups`.

Note that `,groups` and `,gender` are incompatible with each other. If you wish to continue using `,gender`, reset `,groups` first. 

![groups](/images/groups.png)


# Full Command List
Use `,help [command_name]` for more details for any of the following commands.
## General Commands 
- `,play`: Begin a game of KMQ. The bot will play a random song based on the currently chosen filters.
- `,end`: Stop the current game of KMQ. The bot will display the winner of the game.
- `,skip`: Starts a vote to skip the current playing song. Based on majority rule.
- `,options`: Shows the current game options, which filters the songs that will be played
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
- `,mode`: Choose whether to guess based on song name or artist name

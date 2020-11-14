# Frequently Asked Questions
## Why isn't [x] artist or [y] song available on the bot?
All song and artist data is retrieved from [the database kindly provided by Aoimirai](http://kpop.aoimirai.net/). According to their guidelines, songs are generally only listed if they are an *official* music video. Album B-sides are not considered on this site, therefore, not considered on this bot.

If you think an official music video is missing, consider contributing to the Aoimirai database (following their guidelines), and the bot will have the new song within a week.

## I'm entering the correct song name but it's not be accepted as the correct answer
1. Do *not* submit your answer with the prefix `,`. If the correct answer is `Boombayah`, simply type `Boombayah` in the chat
2. Some song names may be spelled differently than what you have in memory. For example, `I Need U` vs `I Need You`
3. You have changed the *guess mode* game option. See `,help mode` for more details
4. You must be in the same voice channel as the bot, *and* typing your answer in the text channel the game started in

If none of these apply, the song's name in the database *may* be incorrect. You may report these in #song-aliases in the official support server found in `,help`. 

## The bot keeps repeating the same songs
Your current set of game options is limiting the choice of songs available. You can check your game options by using `,options`. 

Common reasons include:
1. `,limit` is too low. This option limits the amount of songs played out of the total songs defined by the other game options, consider raising this if it's too low
2. The other options are too restrictive. Consider changing the options to allow for more songs, or `,reset` to reset to the default options

You can also use `,shuffle unique` to ensure *every* song is played at least once before any repeats occur.
## The bot isn't recognizing the artist I'm entering in `,groups` or as an answer with `,mode artist`
When specifying artists in `,groups`, they must be spelled **exactly** as shown on the list shown in `,help groups`. Subunits are considered separate artists.

When specifying an artist as a guess, they must be shown exactly as in `,help groups`, with a few exceptions.
1. If the song is a collaboration between artists such as `BIGBANG + 2NE1` (indicated by a + sign), you may enter *either* of the names
2. Punctuation is not required. `Bae Jinyoung` will be accepted for a song by `Bae Jin-young`.

## The bot is lagging
If this lasts for more than 5 minutes, let us know in the support server found in `,help`

## I have an amazing feature request
Recommend it in the #suggestions channel in the support server found in `,help`

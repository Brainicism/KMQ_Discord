const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const parse = require('csv-parse/lib/sync')
const request = require('request');
const db = new sqlite3.Database('./main.db', (err) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('Connected to database.');
    console.log('Building database...');

});
const video_source = 'kpop_videos_mv_aoimirai.csv';
const artist_source = 'kpop_artists_mv_aoimirai.csv';
const video_contents = fs.readFileSync(video_source);
const artist_contents = fs.readFileSync(artist_source);
const videos = parse(video_contents, { comment: '#', relax_column_count: true });
const artists = parse(artist_contents, { comment: '#', relax: true, relax_column_count: true });
const video_insert_query = "INSERT INTO videos(id, parentID, artistID, name, video_type, youtube_link, views, likes, publish_date, last_updated, dead) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
const artist_insert_query = "INSERT INTO artists(id, name, stylized_name, gender, is_solo, parent_groupID, formation_date, disband_date, social_media, followers, max_followers) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";


db.serialize(() => {
    db.run(`DROP TABLE IF EXISTS videos`);
    db.run(`DROP TABLE IF EXISTS artists`);
    db.run(`CREATE TABLE videos (id INTEGER PRIMARY KEY, parentID INTEGER, artistID TEXT, name TEXT, video_type TEXT, youtube_link TEXT, views INTEGER, likes INTEGER, publish_date TEXT, last_updated TEXT, dead TEXT, FOREIGN KEY(artistID) references artists(id))`);
    db.run(`CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT, stylized_name TEXT, gender TEXT, is_solo TEXT, parent_groupID INTEGER, formation_date TEXT, disband_date TEXT, social_media TEXT, followers TEXT, max_followers INTEGER)`);
    db.parallelize(() => {
        console.log("Importing video data");
        for (let i = 0; i < videos.length; i++) {
            let video = videos[i];
            db.run(video_insert_query,
                [parseInt(video[0]), // id (video)
                    parseInt(video[1]), // parentID
                    video[2], //artistID
                    video[3], // name
                    video[4], // video_type
                    video[5], // youtube_link
                    parseInt(video[6]), // views
                    parseInt(video[7]), // likes
                    video[8], // publish_date
                    video[9], //last_updated
                    video[10]], // dead
                (err) => {
                    if (err) {
                        console.log("Failed inserting video: " + err)
                        return;
                    }
                })
        }
        console.log("Importing artist data");
        for (let i = 0; i < artists.length; i++) {
            let artist = artists[i];
            db.run(artist_insert_query,
                [parseInt(artist[0]), // id (artist)
                    artist[1], // name
                    artist[2], // stylized_name
                    artist[3], // gender
                    artist[4], // is_solo
                    artist[5], // parent_groupID
                    artist[6], // formation_date
                    artist[7], // disband_date
                    artist[8], // social_media
                    artist[9], // followers
                    parseInt(artist[10])], // max_followers
                (err) => {
                    if (err) {
                        console.error("Failed inserting artist: " + err);
                        return;
                    }
                })
        }
    })
})

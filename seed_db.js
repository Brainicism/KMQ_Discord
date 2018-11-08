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

});

db.serialize(() => {
    db.run(`DROP TABLE IF EXISTS artists`);
    db.run(`DROP TABLE IF EXISTS videos`);
    db.run(`CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT, gender TEXT, formation_date TEXT, followers INTEGER)`);
    db.run(`CREATE TABLE videos (id INTEGER PRIMARY KEY, artistID TEXT, name TEXT, video_type TEXT, youtube_link TEXT, views INTEGER, publish_date TEXT, dead TEXT, FOREIGN KEY(artistID) references artists(id))`);
    db.parallelize(() => {
        request('http://www.aoimirai.net/kpop/api.php?command=listVideos&listType=full', function (error, response, body) {
            console.log("Importing video data");
            if (!error && response.statusCode == 200) {
                let videos = JSON.parse(body);
                for (let i = 0; i < videos.length; i++) {
                    let video = videos[i];
                    let insert_query = "INSERT INTO videos(artistID, name, video_type, youtube_link, views, publish_date, dead) VALUES(?, ?, ?, ?, ?, ?, ?)";
                    db.run(insert_query, [video.artistID, video.musicName, video.videoType, video.link, video.views, video.publish_date, video.isDead], (err) => {
                        if (err) {
                            console.log("Failed inserting video: " + err);
                            return;
                        }
                    })
                }
            }
        })
        request('http://www.aoimirai.net/kpop/api.php?command=listArtists&listType=full', function (error, response, body) {
            console.log("Importing artist data");
            if (!error && response.statusCode == 200) {
                let artists = JSON.parse(body);
                let insert_query = "INSERT INTO artists(id, name, gender, formation_date, followers) VALUES(?, ?, ?, ?, ?)";
                for (let i = 0; i < artists.length; i++) {
                    let artist = artists[i];
                    db.run(insert_query, [artist.artistID, artist.artistName, artist.gender, artist.debutYear, artist.followersTotal], (err) => {
                        if (err) {
                            console.err("Failed inserting artist: " + err);
                            return;
                        }
                    })
                }
            }
        })
    })
})

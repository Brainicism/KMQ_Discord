const sqlite3 = require('sqlite3').verbose();
const request = require('request');
const db = new sqlite3.Database('./main.db', (err) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('Connected to database.');

});


var headers = {
    'authority': 'dbkpop.com',
    'accept': 'application/json, text/javascript, */*; q=0.01',
    'origin': 'https://dbkpop.com',
    'x-requested-with': 'XMLHttpRequest',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'referer': 'https://dbkpop.com/db/k-pop-music-videos'
};

var dataString = 'draw=1&columns%5B0%5D%5Bdata%5D=0&columns%5B0%5D%5Bname%5D=mvpage&columns%5B0%5D%5Bsearchable%5D=true&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B0%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B1%5D%5Bdata%5D=1&columns%5B1%5D%5Bname%5D=rel_date&columns%5B1%5D%5Bsearchable%5D=true&columns%5B1%5D%5Borderable%5D=true&columns%5B1%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B1%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B2%5D%5Bdata%5D=2&columns%5B2%5D%5Bname%5D=artist&columns%5B2%5D%5Bsearchable%5D=true&columns%5B2%5D%5Borderable%5D=true&columns%5B2%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B2%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B3%5D%5Bdata%5D=3&columns%5B3%5D%5Bname%5D=song&columns%5B3%5D%5Bsearchable%5D=true&columns%5B3%5D%5Borderable%5D=true&columns%5B3%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B3%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B4%5D%5Bdata%5D=4&columns%5B4%5D%5Bname%5D=hangul&columns%5B4%5D%5Bsearchable%5D=true&columns%5B4%5D%5Borderable%5D=true&columns%5B4%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B4%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B5%5D%5Bdata%5D=5&columns%5B5%5D%5Bname%5D=director&columns%5B5%5D%5Bsearchable%5D=true&columns%5B5%5D%5Borderable%5D=true&columns%5B5%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B5%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B6%5D%5Bdata%5D=6&columns%5B6%5D%5Bname%5D=videourl&columns%5B6%5D%5Bsearchable%5D=true&columns%5B6%5D%5Borderable%5D=true&columns%5B6%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B6%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B7%5D%5Bdata%5D=7&columns%5B7%5D%5Bname%5D=groupt&columns%5B7%5D%5Bsearchable%5D=true&columns%5B7%5D%5Borderable%5D=true&columns%5B7%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B7%5D%5Bsearch%5D%5Bregex%5D=false&columns%5B8%5D%5Bdata%5D=8&columns%5B8%5D%5Bname%5D=reltype&columns%5B8%5D%5Bsearchable%5D=true&columns%5B8%5D%5Borderable%5D=true&columns%5B8%5D%5Bsearch%5D%5Bvalue%5D=&columns%5B8%5D%5Bsearch%5D%5Bregex%5D=false&order%5B0%5D%5Bcolumn%5D=1&order%5B0%5D%5Bdir%5D=desc&start=0&length=-1&search%5Bvalue%5D=&search%5Bregex%5D=false&wdtNonce=706aa71f49';

var options = {
    url: 'https://dbkpop.com/wp-admin/admin-ajax.php?action=get_wdtable&table_id=9',
    method: 'POST',
    headers: headers,
    body: dataString
};
var youtubeExtractRegex = /href="(.*)"/;

db.serialize(() => {
    db.run(`DROP TABLE IF EXISTS videos`);
    db.run(`CREATE TABLE videos (id INTEGER PRIMARY KEY, date TEXT, artist TEXT, songName TEXT, koreanName TEXT, videoLink TEXT, type TEXT, release TEXT)`);
    db.parallelize(() => {
        request(options, (error, response, body) => {
            if (!error && response.statusCode == 200) {
                let result = JSON.parse(body);
                console.log("Records retrieved: " + result.recordsTotal);
                for (let i = 0; i < result.data.length; i ++) {
                    let musicVideo = result.data[i];
                    let date = musicVideo[1];
                    let artist = musicVideo[2];
                    let songName = musicVideo[3];
                    let koreanName = musicVideo[4];
                    let videoLink = musicVideo[6].match(youtubeExtractRegex)[1];
                    //Girl, Boy, Boy Solo, Girl Solo, Co-ed, Co-Ed
                    let type = musicVideo[7];
                    //Major, Japanese, Special, Minor, English, CF, OST, Chinese
                    let release = musicVideo[8];
                    let insertQuery = "INSERT INTO videos(id, date, artist, songName, koreanName, videoLink, type, release) VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
                    db.run(insertQuery, [i, date, artist, songName, koreanName, videoLink, type, release], (e) => {
                        if (e){
                            console.log("Failed inserting video: " + err);
                            return;
                        }
                    })
                }
            }
        });
    })
})

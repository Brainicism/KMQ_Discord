var request = require('request-promise')
var fs = require("fs")
const mkdirp = require('mkdirp')
const { execSync } = require('child_process');
var unzipper = require("unzipper")

var fileUrl = "http://kpop.aoimirai.net/download.php";

//TODO: this file is kinda scuffed, refactor later

let options = {
  url: fileUrl,
  encoding: null,
  headers: {
    "Host": "kpop.aoimirai.net",
    "User-Agent": "PostmanRuntime/7.22.0"
  }
}

mkdirp("/tmp/kmq")
mkdirp("/tmp/kmq/sql")
let output = "/tmp/kmq/bootstrap.zip"
request(options)
  .then((resp, body) => {
    fs.writeFile(output, resp, function (err) {
      console.log("Downloaded database.zip");
    });
  })
  .then(() => {
    fs.createReadStream('/tmp/kmq/bootstrap.zip')
      .pipe(unzipper.Extract({ path: '/tmp/kmq/sql/' }))
      .on("error", (err) => {
        console.log("Extracted database.zip");
        // this throws an error even though it finished successfully
        fs.readdir("/tmp/kmq/sql", (err, files) => {
          execSync(`mysql -e " DROP DATABASE IF EXISTS kmq";`)
          execSync(`mysql -e " CREATE DATABASE kmq";`)
          execSync(`mysql kmq < /tmp/kmq/sql/${files[0]}`)
          console.log(`Imported database dump (${files[0]}) successfully`);
        })
      })
  })

  .catch(e => console.log(e.toString()))
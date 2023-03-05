const ytdl = require("ytdl-core");
const fs = require("fs");

(async () => {
    const url = "https://www.youtube.com/watch?v=jP2J0qnFtV4";
    console.log(`Downloading from ${url} ...`);
    const stream = ytdl(url, {
        filter: "audioonly",
        quality: "highest",
    });

    let downloadedBytesPrev = null;
    let lastUpdate = null;
    let startTime = Date.now();
    let fileTotalBytes = null;
    stream.on("progress", (_chunkLength, downloadedBytes, totalBytes) => {
        if (!downloadedBytesPrev) {
            downloadedBytesPrev = downloadedBytes;
            lastUpdate = Date.now();
            fileTotalBytes = totalBytes;
            return;
        }

        const timeSinceLastUpdate = (Date.now() - lastUpdate) / 1000;
        if (timeSinceLastUpdate > 1) {
            console.log(
                `Download speed: ${(
                    (downloadedBytes - downloadedBytesPrev) /
                    1024 /
                    ((Date.now() - lastUpdate) / 1000)
                ).toFixed(2)} KB/s | ${(
                    (100.0 * downloadedBytes) /
                    totalBytes
                ).toFixed(2)}% (${downloadedBytes}/${totalBytes})`
            );

            downloadedBytesPrev = downloadedBytes;
            lastUpdate = Date.now();
        }
    });

    stream.on("finish", () => {
        const downloadTime = (Date.now() - startTime) / 1000;
        console.log(
            `Finished downloading after ${downloadTime}s @ ${(
                fileTotalBytes /
                1024 /
                downloadTime
            ).toFixed(2)}KB/s`
        );
    });

    stream.pipe(fs.createWriteStream("./output2.mp3"));
})();

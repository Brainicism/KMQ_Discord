/* eslint-disable node/no-sync */
/* eslint-disable @typescript-eslint/no-implied-eval */
/* eslint-disable no-console */
import { BG } from "bgutils-js";
import { JSDOM } from "jsdom";
import { Proto } from "youtubei.js";
import { YOUTUBE_SESSION_TMP_COOKIE_PATH } from "../constants";
import fs from "fs";

// mostly copied from https://github.com/LuanRT/BgUtils/tree/main/examples/node

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    // hardcoded API key that has been used by youtube for years
    const requestKey = "O43z0dpjhgX20SCx4KAo";

    const visitorId = fs
        .readFileSync(YOUTUBE_SESSION_TMP_COOKIE_PATH)
        .toString()
        .split("\n")
        .find((x) => x.includes("VISITOR_INFO1_LIVE"))
        ?.split("\t")
        .at(-1);

    if (!visitorId) {
        console.error(
            "Visitor ID could not be found. Make sure to grab basic cookie from Youtube first",
        );
        process.exit(1);
    }

    console.info(`Found visitor ID: ${visitorId}`);

    const visitorData = Proto.encodeVisitorData(
        visitorId,
        Math.floor(Date.now() / 1000),
    );

    const dom = new JSDOM();

    globalThis.window = dom.window as any;
    globalThis.document = dom.window.document;

    const bgConfig = {
        fetch: (url: any, options: any) => fetch(url, options),
        globalObj: globalThis,
        identity: visitorData,
        requestKey,
    };

    const challenge = await BG.Challenge.create(bgConfig);

    if (!challenge) throw new Error("Could not get challenge");

    if (challenge.script) {
        const script = challenge.script.find((sc) => sc !== null);
        if (script) new Function(script)();
    } else {
        console.warn("Unable to load Botguard.");
    }

    const poToken = await BG.PoToken.generate({
        program: challenge.challenge,
        globalName: challenge.globalName,
        bgConfig,
    });

    console.info("po_token:", poToken);
    console.info("visitor_data:", visitorData);
})();

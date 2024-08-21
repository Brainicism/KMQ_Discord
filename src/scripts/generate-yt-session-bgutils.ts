/* eslint-disable @typescript-eslint/no-implied-eval */
/* eslint-disable no-console */
import { BG } from "bgutils-js";
import { JSDOM } from "jsdom";
import { Proto, Utils } from "youtubei.js";
// mostly copied from https://github.com/LuanRT/BgUtils/tree/main/examples/node

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
    // hardcoded API key that has been used by youtube for years
    const requestKey = "O43z0dpjhgX20SCx4KAo";
    const visitorData = Proto.encodeVisitorData(
        Utils.generateRandomString(11),
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

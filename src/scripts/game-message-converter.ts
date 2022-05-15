/* eslint-disable no-await-in-loop */
import { IPCLogger } from "../logger";
import dbContext from "../database_context";
import fs from "fs";
import path from "path";

const logger = new IPCLogger("game-message-converter");

const enFile = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../i18n/en.json")).toString()
);

const koFile = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../i18n/ko.json")).toString()
);

(async () => {
    if (require.main === module) {
        for (const category of Object.keys(enFile.misc.gameMessages)) {
            for (const [key, entry] of Object.entries(
                enFile.misc.gameMessages[category as any]
            )) {
                const gameMessageTranslationKey = `misc.gameMessages.${category}.${key}`;

                const newMessageContent = JSON.stringify({
                    en: entry,
                    ko: koFile.misc.gameMessages[category as any][key as any],
                });

                logger.info(gameMessageTranslationKey);
                logger.info(newMessageContent);

                await dbContext
                    .kmq("game_messages")
                    .where("message", "=", gameMessageTranslationKey)
                    .update({
                        message: newMessageContent,
                    });
            }
        }

        await dbContext.destroy();
    }
})();

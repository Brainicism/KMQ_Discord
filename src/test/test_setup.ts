// eslint-disable-next-line import/no-extraneous-dependencies
import sinon from "sinon";
import log4js from "log4js";
import * as discordUtils from "../helpers/discord_utils";
import kmqTestKnexConfig from "../config/knexfile_kmq_test";
import dbContext from "../database_context";
import Player from "../structures/player";

const sandbox = sinon.createSandbox();

before(async () => {
    sandbox.stub(discordUtils, "sendErrorMessage");
    sandbox.stub(discordUtils, "sendInfoMessage");
    sandbox.stub(Player, "fromUserID").callsFake((id) => (new Player("", id, "", 0)));
    log4js.getLogger().level = "off";
    await dbContext.kmq.migrate.latest({
        directory: kmqTestKnexConfig.migrations.directory,
    });
    return false;
});

after(() => {
    sandbox.restore();
});

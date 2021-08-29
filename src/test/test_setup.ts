// eslint-disable-next-line import/no-extraneous-dependencies
import sinon from "sinon";
import * as discordUtils from "../helpers/discord_utils";
import kmqKnexConfig from "../config/knexfile_kmq";
import dbContext from "../database_context";
import Player from "../structures/player";

const sandbox = sinon.createSandbox();

before(async function () {
    this.timeout(10000);
    sandbox.stub(discordUtils, "sendErrorMessage");
    sandbox.stub(discordUtils, "sendInfoMessage");
    sandbox.stub(Player, "fromUserID").callsFake((id) => (new Player("", id, "", 0)));
    await dbContext.kmq.migrate.latest({
        directory: kmqKnexConfig.migrations.directory,
    });
    return false;
});

after(() => {
    sandbox.restore();
});

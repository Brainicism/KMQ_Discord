// eslint-disable-next-line import/no-extraneous-dependencies
import sinon from "sinon";
import log4js from "log4js";
import * as discordUtils from "../helpers/discord_utils";

const sandbox = sinon.createSandbox();

before(() => {
    sandbox.stub(discordUtils, "sendErrorMessage");
    sandbox.stub(discordUtils, "sendInfoMessage");
    log4js.getLogger().level = "off";
    return false;
});

after(() => {
    sandbox.restore();
});

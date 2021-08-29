import { Campaign } from "patreon-discord";
import dbContext from "../database_context";
import { IPCLogger } from "../logger";
import { addPremium, removePremium } from "./game_utils";

const logger = new IPCLogger("patreon_manager");

const campaign = new Campaign({
    patreonToken: process.env.PATREON_CREATOR_ACCESS_TOKEN,
    campaignId: process.env.PATREON_CAMPAIGN_ID,
});

interface Patron {
    patron_status: string,
    discord_user_id: string,
}

export default async function updatePremiumUsers() {
    let fetchedPatrons: Array<Patron>;
    try {
        fetchedPatrons = await campaign.fetchPatrons(["active_patron", "declined_patron"]);
    } catch (err) {
        logger.error(`Failed fetching patrons. err = ${err}`);
        return;
    }

    const patrons: { discordID: string, activePatron: boolean }[] = fetchedPatrons
        .filter((x: Patron) => !!x.discord_user_id)
        .map((x: Patron) => ({ discordID: x.discord_user_id, activePatron: x.patron_status === "active_patron" }));

    const activePatronIDs: string[] = patrons.filter((x) => x.activePatron).map((x) => x.discordID);
    removePremium((await dbContext.kmq("premium_users").select("user_id").whereNotIn("user_id", activePatronIDs)).map((x) => x.user_id));
    addPremium(activePatronIDs);
}

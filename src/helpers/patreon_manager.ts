import { Campaign } from "patreon-discord";
import dbContext from "../database_context";
import { addPremium, removePremium } from "./game_utils";

const campaign = new Campaign({
    patreonToken: process.env.PATREON_CREATOR_ACCESS_TOKEN,
    campaignId: process.env.PATREON_CAMPAIGN_ID,
});

interface Patron {
    patron_status: string,
    discord_user_id: string,
}

export default async function updatePremiumUsers() {
    const patrons: { discordID: string, activePatron: boolean }[] = (await campaign.fetchPatrons(["active_patron", "declined_patron"]))
        .filter((x: Patron) => !!x.discord_user_id)
        .map((x: Patron) => ({ discordID: x.discord_user_id, activePatron: x.patron_status === "active_patron" }));

    const activePatronIDs: string[] = patrons.filter((x) => x.activePatron).map((x) => x.discordID);
    removePremium((await dbContext.kmq("premium_users").select("user_id").whereNotIn("user_id", activePatronIDs)).map((x) => x.user_id));
    addPremium(activePatronIDs);
}

import { Campaign } from "patreon-discord";
import dbContext from "../database_context";
import { IPCLogger } from "../logger";
import { addPremium, removePremium } from "./game_utils";

const logger = new IPCLogger("patreon_manager");

export const PATREON_SUPPORTER_BADGE = "🎧 Premium Supporter";

const campaign = new Campaign({
    patreonToken: process.env.PATREON_CREATOR_ACCESS_TOKEN,
    campaignId: process.env.PATREON_CAMPAIGN_ID,
});

interface PatronResponse {
    patron_status: string;
    discord_user_id: string;
    pledge_relationship_start?: Date;
}

export interface Patron {
    discordID: string;
    activePatron: boolean;
    firstSubscribed?: Date;
}

/**
 * Fetch up-to-date Patreon members and update Premium members accordingly
 */
export default async function updatePremiumUsers(): Promise<void> {
    let fetchedPatrons: Array<PatronResponse>;
    try {
        fetchedPatrons = await campaign.fetchPatrons([
            "active_patron",
            "declined_patron",
        ]);
    } catch (err) {
        logger.error(`Failed fetching patrons. err = ${err}`);
        return;
    }

    const patrons: Array<Patron> = fetchedPatrons
        .filter((x: PatronResponse) => !!x.discord_user_id)
        .map((x: PatronResponse) => ({
            discordID: x.discord_user_id,
            activePatron: x.patron_status === "active_patron",
            firstSubscribed: x.pledge_relationship_start,
        }));

    const activePatronIDs: string[] = patrons
        .filter((x) => x.activePatron)
        .map((x) => x.discordID);

    removePremium(
        (
            await dbContext
                .kmq("premium_users")
                .select("user_id")
                .whereNotIn("user_id", activePatronIDs)
        ).map((x) => x.user_id)
    );
    addPremium(patrons);
}

import dbContext from "../database_context";
import Patron from "../interfaces/patron";
import State from "../state";
import { IPCLogger } from "../logger";
import { addPremium, removePremium } from "./game_utils";

const logger = new IPCLogger("patreon_manager");

export const PATREON_SUPPORTER_BADGE = "🎧 Premium Supporter";

interface PatronResponse {
    patron_status: string;
    discord_user_id: string;
    pledge_relationship_start?: Date;
}

enum PatronState {
    ACTIVE = "active_patron",
    DECLINED = "declined_patron",
}

/**
 * Fetch up-to-date Patreon members and update Premium members accordingly
 */
export default async function updatePremiumUsers(): Promise<void> {
    if (
        !State.patreonCampaign ||
        !process.env.PATREON_CREATOR_ACCESS_TOKEN ||
        !process.env.PATREON_CAMPAIGN_ID
    ) {
        return;
    }

    let fetchedPatrons: Array<PatronResponse>;
    try {
        fetchedPatrons = await State.patreonCampaign.fetchPatrons([
            PatronState.ACTIVE,
            PatronState.DECLINED,
        ]);
    } catch (err) {
        logger.error(`Failed fetching patrons. err = ${err}`);
        return;
    }

    const patrons: Array<Patron> = fetchedPatrons
        .filter((x: PatronResponse) => !!x.discord_user_id)
        .map((x: PatronResponse) => ({
            activePatron: x.patron_status === PatronState.ACTIVE,
            discordID: x.discord_user_id,
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
                .whereNot("source", "=", "loyalty")
        ).map((x) => x.user_id)
    );
    addPremium(patrons);
}

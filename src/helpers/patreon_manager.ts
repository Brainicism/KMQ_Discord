import { IPCLogger } from "../logger";
import { addPremium, removePremium } from "./game_utils";
import Axios from "axios";
import dbContext from "../database_context";
import type Patron from "../interfaces/patron";

const logger = new IPCLogger("patreon_manager");

interface PatronResponse {
    attributes: {
        patron_status: string;
        pledge_relationship_start?: Date;
        social_connections: {
            discord: string;
        };
    };
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
        !process.env.PATREON_CREATOR_ACCESS_TOKEN ||
        !process.env.PATREON_CAMPAIGN_ID
    ) {
        return;
    }

    let fetchedPatrons: Array<PatronResponse>;
    try {
        fetchedPatrons = (
            await Axios.get(
                `https://www.patreon.com/api/oauth2/v2/campaigns/${process.env.PATREON_CAMPAIGN_ID}/members`,
                {
                    params: {
                        include: "user,currently_entitled_tiers",
                        fields: {
                            member: "patron_status",
                        },
                    },
                    headers: {
                        Authorization: `Bearer ${process.env.PATREON_CREATOR_ACCESS_TOKEN}`,
                    },
                }
            )
        ).data.data;
    } catch (err) {
        logger.error(`Failed fetching patrons. err = ${err}`);
        return;
    }

    const patrons: Array<Patron> = fetchedPatrons
        .filter(
            (x: PatronResponse) => !!x.attributes.social_connections.discord
        )
        .map((x: PatronResponse) => ({
            activePatron: x.attributes.patron_status === PatronState.ACTIVE,
            discordID: x.attributes.social_connections.discord,
            firstSubscribed: x.attributes.pledge_relationship_start,
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

import { IPCLogger } from "../logger";
import { addPremium, removePremium } from "./game_utils";
import Axios from "axios";
import dbContext from "../database_context";
import type Patron from "../interfaces/patron";

const logger = new IPCLogger("patreon_manager");

interface PatreonResponse {
    data: Array<{
        attributes: {
            patron_status: string;
            pledge_relationship_start?: Date;
            social_connections: {
                discord: string;
            };
            user: {
                data: {
                    id: string;
                };
            };
        };
        relationships: {
            user: {
                data: {
                    id: string;
                };
            };
        };
        type: string;
    }>;

    included: Array<{
        attributes: {
            social_connections: {
                discord: {
                    user_id: string;
                };
            };
        };
        id: string;
        type: string;
    }>;
}

enum PatronState {
    ACTIVE = "active_patron",
    DECLINED = "declined_patron",
}

function parsePatreonResponse(patreonResponse: PatreonResponse): Array<Patron> {
    const patrons: Array<Patron> = [];
    for (const data of patreonResponse.data) {
        if (data.type !== "member") continue;
        const patreonMemberID = data.relationships.user.data.id;
        const matchedPatreonUser = patreonResponse.included.find(
            (x) => x.type === "user" && x.id === patreonMemberID
        );

        if (!matchedPatreonUser) {
            logger.error(
                `Couldn't find corresponding Patreon user for ${patreonMemberID}`
            );
            continue;
        }

        patrons.push({
            discordID:
                matchedPatreonUser.attributes.social_connections.discord
                    .user_id,
            activePatron: data.attributes.patron_status === PatronState.ACTIVE,
            firstSubscribed: new Date(
                data.attributes.pledge_relationship_start
            ),
        });
    }

    return patrons;
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

    let fetchedPatrons: Array<Patron>;
    try {
        const response: PatreonResponse = (
            await Axios.get(
                `https://www.patreon.com/api/oauth2/v2/campaigns/${
                    process.env.PATREON_CAMPAIGN_ID
                }/members${encodeURI(
                    "?include=user,currently_entitled_tiers&fields[member]=patron_status,pledge_relationship_start&fields[user]=social_connections"
                )}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PATREON_CREATOR_ACCESS_TOKEN}`,
                    },
                }
            )
        ).data;

        fetchedPatrons = parsePatreonResponse(response);
    } catch (err) {
        logger.error(`Failed fetching patrons. err = ${err}`);
        return;
    }

    const patrons: Array<Patron> = fetchedPatrons.filter((x) => !!x.discordID);

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

import { IPCLogger } from "../logger";
import { updatePremium } from "./game_utils";
import Axios from "axios";
import KmqConfiguration from "../kmq_configuration";
import dbContext from "../database_context";
import type Patron from "../interfaces/patron";

const logger = new IPCLogger("patreon_manager");

interface PatreonResponse {
    data: Array<{
        attributes: {
            patron_status: string;
            pledge_relationship_start?: string;
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
                discord?: {
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
    FORMER = "former_patron",
}

function parsePatreonResponse(patreonResponse: PatreonResponse): Array<Patron> {
    const patrons: Array<Patron> = [];
    for (const userData of patreonResponse.data) {
        if (userData.type !== "member") continue;

        const patreonMemberID = userData.relationships.user.data.id;
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
            discordID: matchedPatreonUser.attributes.social_connections?.discord
                ?.user_id as string,
            activePatron:
                userData.attributes.patron_status === PatronState.ACTIVE,
            firstSubscribed: new Date(
                userData.attributes.pledge_relationship_start as string
            ),
        });
    }

    return patrons;
}

/**
 * Fetch up-to-date Patreon members and update Premium members accordingly
 */
export default async function updatePremiumUsers(): Promise<void> {
    if (!KmqConfiguration.Instance.patreonFetchingEnabled()) {
        return;
    }

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

    await updatePremium(
        patrons,
        (
            await dbContext.kmq
                .selectFrom("premium_users")
                .select("user_id")
                .where("user_id", "not in", activePatronIDs)
                .where("source", "!=", "loyalty")
                .execute()
        ).map((x) => x.user_id)
    );
}

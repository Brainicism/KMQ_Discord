import { NewsRange } from "../commands/misc_commands/kmqnews";

export default interface NewsSubscription {
    guildID: string;
    textChannelID: string;
    range: NewsRange;
    createdAt: Date;
}

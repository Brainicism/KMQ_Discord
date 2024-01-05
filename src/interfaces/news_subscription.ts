import type NewsRange from "../enums/news_range";

export default interface NewsSubscription {
    guildID: string;
    textChannelID: string;
    range: NewsRange;
    createdAt: Date;
}

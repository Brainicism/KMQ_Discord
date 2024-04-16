import type Eris from "eris";

export default interface EmbedPayload {
    title: string;
    url?: string;
    description?: string;
    footerText?: string;
    thumbnailUrl?: string;
    timestamp?: Date;
    fields?: Eris.EmbedField[];
    author?: {
        username: string;
        avatarUrl: string;
    };
    color?: number;
    actionRows?: Eris.ActionRow[];
}

import KmqMember from "./kmq_member.js";
import State from "../state.js";
import type Eris from "eris";

export default class MessageContext {
    /** The text channel to send the message to */
    public textChannelID: string;

    /** The author to represent the message as */
    public author: KmqMember;

    /** The guild ID to send the message to */
    public guildID: string;

    /** The ID of the originating message */
    public referencedMessageID: string | null;

    constructor(
        textChannelID: string,
        author: KmqMember | null,
        guildID: string,
        referencedMessageID?: string,
    ) {
        this.textChannelID = textChannelID;
        this.author = author ?? new KmqMember(State.client.user.id);
        this.guildID = guildID;
        this.referencedMessageID = referencedMessageID ?? null;
    }

    /**
     * @param message - The Message object
     * @returns a MessageContext
     */
    static fromMessage(message: Eris.Message): MessageContext {
        return new MessageContext(
            message.channel.id,
            new KmqMember(message.author.id),
            message.guildID as string,
            message.id,
        );
    }
}

import Eris from "eris";
import { getUserTag } from "../helpers/discord_utils";
import { state } from "../kmq_worker";
import KmqMember from "./kmq_member";

export default class MessageContext {
    /** The text channel to send the message to */
    public textChannelID: string;

    /** The author to represent the message as */
    public author: KmqMember;

    /** The guild ID to send the message to */
    public guildID: string;

    /** The ID of the originating message */
    public referencedMessageID: string;

    constructor(textChannelID: string, author?: KmqMember, guildID?: string, referencedMessageID?: string) {
        this.textChannelID = textChannelID;
        this.author = author;
        if (!author) {
            const clientUser = state.client.user;
            this.author = new KmqMember(clientUser.username, getUserTag(clientUser), clientUser.avatarURL, clientUser.id);
        }

        this.guildID = guildID;
        this.referencedMessageID = referencedMessageID;
    }

    /**
     * @param message - The Message object
     * @returns a MessageContext
     */
    static fromMessage(message: Eris.Message): MessageContext {
        return new MessageContext(message.channel.id, new KmqMember(message.author.username, getUserTag(message.author), message.author.avatarURL, message.author.id), message.guildID, message.id);
    }
}

import type ActivityEvent from "./activity_event";

export default interface ActivityWorkerEventMessage {
    guildID: string;
    event: ActivityEvent;
}

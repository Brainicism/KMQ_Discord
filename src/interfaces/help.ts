import Eris from "eris";

export default interface HelpDocumentation {
    name: string;
    description: string;
    usage: string;
    examples: Array<{ example: string; explanation: string }>;
    actionRowComponents?: Eris.ActionRowComponents[];
    priority?: number;
}

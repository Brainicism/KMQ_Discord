import type Eris from "eris";

export default interface HelpDocumentation {
    name: string;
    description: string;
    examples: Array<{ example: string; explanation: string }>;
    actionRowComponents?: Eris.ActionRowComponents[];
    priority: number;
}

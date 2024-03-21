export default interface ParsedGameOptionValues {
    [commandName: string]: {
        value: string;
        updated: boolean;
    };
}

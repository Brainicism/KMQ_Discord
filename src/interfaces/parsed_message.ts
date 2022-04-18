export default interface ParsedMessage {
    action: string;
    argument: string;
    message: string;
    components: Array<string>;
}

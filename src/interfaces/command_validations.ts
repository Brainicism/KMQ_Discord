export default interface CommandValidations {
    minArgCount: number;
    maxArgCount?: number;
    arguments: Array<{
        type: "number" | "boolean" | "enum" | "char";
        name: string;
        minValue?: number;
        maxValue?: number;
        enums?: Array<string>;
    }>;
}

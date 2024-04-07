export default interface CommandValidations {
    minArgCount: number;
    maxArgCount?: number;
    arguments: Array<{
        type: "int" | "float" | "boolean" | "enum" | "char" | "string";
        name: string;
        minValue?: number;
        maxValue?: number;
        enums?: Array<string>;
    }>;
}

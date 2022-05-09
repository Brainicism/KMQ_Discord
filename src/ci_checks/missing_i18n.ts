import { IPCLogger } from "../logger";
import { ScriptTarget, SyntaxKind, createSourceFile } from "typescript";
import { readFileSync } from "fs";
import LocalizationManager from "../helpers/localization_manager";
import type { Node } from "typescript";

const logger = new IPCLogger("missing_i18n");

function getNodeKeys(node: Node): Array<string> {
    const keys = new Set<string>();
    if (
        node.kind === SyntaxKind.StringLiteral &&
        node.parent.kind === SyntaxKind.CallExpression &&
        node.parent["expression"] &&
        node.parent["expression"]["name"] &&
        node.parent["expression"]["name"]["escapedText"] &&
        node.parent["expression"]["name"]["escapedText"] === "translate"
    ) {
        keys.add(node["text"]);
    }

    for (const child of node.getChildren()) {
        const childKeys = getNodeKeys(child);
        for (const key of childKeys) {
            keys.add(key);
        }
    }

    return Array.from(keys);
}

(() => {
    const filenames = process.argv.slice(2);
    const keys = new Set<string>();
    for (const file of filenames) {
        const sourceFile = createSourceFile(
            file,
            readFileSync(file).toString(),
            ScriptTarget.ES2015,
            true
        );

        const fileKeys = getNodeKeys(sourceFile);
        for (const key of fileKeys) {
            keys.add(key);
        }
    }

    const localizationManager = new LocalizationManager();
    const missingKeys = Array.from(keys).filter((key) =>
        localizationManager.hasKey(key)
    );

    for (const missingKey of missingKeys) {
        logger.error(`${missingKey} is missing`);
        process.exit(1);
    }
})();

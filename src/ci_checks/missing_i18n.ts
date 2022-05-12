import { IPCLogger } from "../logger";
import { ScriptTarget, SyntaxKind, createSourceFile } from "typescript";
import { readFileSync } from "fs";
import LocalizationManager from "../helpers/localization_manager";
import type { Node } from "typescript";

const logger = new IPCLogger("missing_i18n");

function getNodeKeys(node: Node): Array<string> {
    const keys = new Set<string>();
    if (
        node.getText().startsWith("LocalizationManager.localizer") &&
        node.kind === SyntaxKind.CallExpression
    ) {
        for (const child of node
            .getChildren()
            .flatMap((x) => x.getChildren())) {
            if (child.kind === SyntaxKind.StringLiteral) {
                keys.add(child.getText());
            } else if (
                [
                    SyntaxKind.BinaryExpression,
                    SyntaxKind.ConditionalExpression,
                ].includes(child.kind)
            ) {
                for (const nestedChild of child
                    .getChildren()
                    .filter((x) => x.kind === SyntaxKind.StringLiteral)) {
                    keys.add(nestedChild.getText());
                }
            }
        }
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
            ScriptTarget.ES2019,
            true
        );

        const fileKeys = getNodeKeys(sourceFile);
        for (const key of fileKeys) {
            keys.add(key);
        }
    }

    const keysArray = Array.from(keys).map((x) => x.slice(1, -1));
    const localizationManager = new LocalizationManager();
    const missingKeys = keysArray.filter(
        (key) => !localizationManager.hasKey(key)
    );

    if (missingKeys.length > 0) {
        for (const missingKey of missingKeys) {
            logger.error(`"${missingKey}" is missing`);
        }

        process.exit(1);
    }
})();

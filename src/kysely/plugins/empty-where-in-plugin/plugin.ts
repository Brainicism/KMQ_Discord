/**
 * Plugin that replaces .where("column", "in", []) with a condition that returns false
 * Plugin that replaces .where("column", "not in", []) with a condition that returns true
 */

import { SelectQueryNode } from "kysely";
import EmptyWhereInTransformer from "./transformer.js";
import type {
    KyselyPlugin,
    PluginTransformQueryArgs,
    PluginTransformResultArgs,
    QueryResult,
    RootOperationNode,
    UnknownRow,
} from "kysely";

export default class EmptyWhereInPlugin implements KyselyPlugin {
    readonly #transformer = new EmptyWhereInTransformer();

    transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
        if (SelectQueryNode.is(args.node)) {
            return this.#transformer.transformNode(args.node);
        }

        return args.node;
    }

    transformResult(
        args: PluginTransformResultArgs,
    ): Promise<QueryResult<UnknownRow>> {
        return Promise.resolve(args.result);
    }
}

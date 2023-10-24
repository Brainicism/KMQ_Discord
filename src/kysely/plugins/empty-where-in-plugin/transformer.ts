import {
    OperationNodeTransformer,
    OperatorNode,
    PrimitiveValueListNode,
    ValueListNode,
    ValueNode,
} from "kysely";
import type { BinaryOperationNode } from "kysely";

export default class EmptyWhereInTransformer extends OperationNodeTransformer {
    protected transformBinaryOperation(
        node: BinaryOperationNode,
    ): BinaryOperationNode {
        const isWhereInOperator =
            OperatorNode.is(node.operator) &&
            ["in", "not in"].includes(node.operator.operator);

        const hasListOperand =
            PrimitiveValueListNode.is(node.rightOperand) ||
            ValueListNode.is(node.rightOperand);

        if (isWhereInOperator && hasListOperand) {
            const valueList = node.rightOperand;
            if (valueList.values.length === 0) {
                return {
                    kind: "BinaryOperationNode",
                    leftOperand: ValueNode.createImmediate("0"),
                    operator: OperatorNode.create("="),
                    rightOperand: ValueNode.createImmediate(
                        node.operator.operator === "in" ? "1" : "0",
                    ),
                };
            }
        }

        return super.transformBinaryOperation(node);
    }
}

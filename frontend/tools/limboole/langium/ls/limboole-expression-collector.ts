import { Expr } from "./generated/ast.js";
import { LimbooleServices } from "./limboole-module.js";
import { DocumentState } from "langium";

export function registerExpressionCollector(services: LimbooleServices) {
    services.shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Parsed, documents => {
        for (const document of documents) {
            services.utils.LimbooleExpressionCollector.findAllBasicExpressions(document.parseResult.value);
        }
    })
}

export class ExpressionCollection {

    expressionMap: { [key: string]: Expr[] };

    constructor() {
        this.expressionMap = {};
    }

    findAllBasicExpressions(rootNode: any): void {
        this.resetCollection();
        this.traverseWithStack(rootNode);
        //this.printCollection();
    }

    addToCollection(expression: string, node: Expr): void {

        // We first need to create a new entry in the map if it doesn't exist
        if (this.expressionMap[expression]) {
            this.expressionMap[expression].push(node);
        } else {
            this.expressionMap[expression] = [node];
        }
    }

    resetCollection(): void {
        this.expressionMap = {};
    }

    getCollection() {
        return this.expressionMap;
    }

    printCollection(): void {
        console.log("Printing all expressions in the collection:");
        for (const expression in this.expressionMap) {
            console.log(expression);
        }
    }

    addNodeIfCondition(node: any): void {
        if (node.var !== undefined) {
            this.addToCollection(node.var, node);
        }
    }

    traverseWithStack(root: any) {
        // Initialize the stack with the root node
        const stack: any[] = [root];
        while (stack.length > 0) {
            // Pop the last node from the stack for depth-first traversal
            const currentNode = stack.pop() as any;

            // Add a new node if the condition is met
            this.addNodeIfCondition(currentNode);

            // Push the right and left children onto the stack if they exist
            if (currentNode.right) stack.push(currentNode.right);
            if (currentNode.left) stack.push(currentNode.left);
        }
    }
}
import { AstNode, GenericAstNode, DefaultScopeComputation, LangiumCoreServices, LangiumDocument, MultiMap, AstNodeDescription } from "langium";



export class SmtScopeComputation extends DefaultScopeComputation{

    constructor(services: LangiumCoreServices) {
            super(services);
    }

    /**
     * Process a single node during scopes computation. Adjusts visibility for nodes inside nested arrays,
     * exposing them one level higher in the AST.
     */
    protected override addLocalSymbol(node: AstNode, document: LangiumDocument, scopes: MultiMap<AstNode, AstNodeDescription>): void {
        const container = node.$container;
        if (container) {
            const name = this.nameProvider.getName(node);
            if (name) {
                const description = this.descriptions.createDescription(node, name, document);
                
                // Expose visibility to it's own container and with that to it's siblings
                scopes.add(container, description);

                // Increase visibility to an additional higher level
                // because properties with multiplicities introduce additional nesting that results in shadowing sibling elements
                if(container.$container && node.$containerProperty){
                    const value = (node.$container as GenericAstNode)[node.$containerProperty as string];
                    if(Array.isArray(value)) scopes.add(container.$container, description); 
                }

                // Special handling for constructor names: expose them at the Model level
                // so they can be referenced globally
                if (node.$type === 'SimpleConstructor' || node.$type === 'ConstructorDec') {
                    let current: AstNode | undefined = container;
                    while (current && current.$type !== 'Model') {
                        current = current.$container;
                    }
                    if (current && current.$type === 'Model') {
                        scopes.add(current, description);
                    }
                }

                // Special handling for named attributes: expose them at the Model level
                // so they can be referenced globally by commands like check-sat-assuming
                if (node.$type === 'NamedAttribute') {
                    console.log(`Processing NamedAttribute with name: ${name}`);
                    let current: AstNode | undefined = container;
                    while (current && current.$type !== 'Model') {
                        current = current.$container;
                    }
                    if (current && current.$type === 'Model') {
                        console.log(`Adding NamedAttribute ${name} to Model scope`);
                        scopes.add(current, description);
                    }
                }
            }
        }
    }
}
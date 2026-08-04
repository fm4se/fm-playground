import { AstNodeDescription, DefaultScopeProvider, EMPTY_SCOPE, ReferenceInfo, Scope, AstUtils, AstNode, LangiumDocuments } from 'langium';
import type { LangiumServices } from 'langium/lsp';
import { AlloyModule, SigDecl, PredDecl, FunDecl, AssertDecl, QuantExpr, SetExpr, LetExpr, EnumDecl, Import, ModulePath, NamedElement, isAlloyModule, isQuantExpr, isSetExpr, isLetExpr, isDecl, isFunDecl, isPredDecl, isModuleDecl, isQualName } from './generated/ast.js';

const IMPORTABLE_TYPES = new Set<string>([
    'AdditionalSig',
    'AssertDecl',
    'EnumDecl',
    'FactDecl',
    'FieldDecl',
    'Decl',
    'FunDecl',
    'MacroDecl',
    'PredDecl',
    'SigDecl'
]);

/**
 * Custom scope provider for the Alloy language that handles name resolution.
 * 
 * Scope resolution in Alloy follows this priority order:
 * 1. Local variables (quantifier variables, let bindings, function/predicate parameters)
 * 2. Module parameters 
 * 3. Imported names from open statements (util/ordering functions like 'first', 'last')
 * 4. Signature names and field names
 * 5. Enum declarations and enum values
 * 6. Predicate, function, and assertion names
 */
export class AlloyScopeProvider extends DefaultScopeProvider {

    private readonly documents: LangiumDocuments;

    constructor(services: LangiumServices) {
        super(services);
        this.documents = services.shared.workspace.LangiumDocuments;
    }

    /**
     * Main entry point for scope resolution. Called by Langium when resolving references.
     * 
     * @param context - Contains the AST node context and reference information
     * @returns Scope containing all available names for the given context
     */
    override getScope(context: ReferenceInfo): Scope {
        const referenceType = this.reflection.getReferenceType(context);
        // Handle different reference types with union types
        if (referenceType === 'NamedElement') {
            // NamedElement is the main type for all named constructs in Alloy
            // (signatures, fields, predicates, functions, variables, etc.)
            return this.createNamedElementScope(context);
        }

        // Fallback to default Langium scope resolution for other reference types
        return super.getScope(context);
    }

    /**
     * Creates a comprehensive scope for NamedElement references.
     * This method aggregates all available names from different sources in priority order.
     * 
     * @param context - Reference context to determine the container module
     * @returns Scope containing all available named elements
     */
    private createNamedElementScope(context: ReferenceInfo): Scope {
        const model = AstUtils.getContainerOfType(context.container, isAlloyModule);
        if (!model) return EMPTY_SCOPE;

        const elements: AstNodeDescription[] = [];

        // Priority 1: Local variables have highest priority and can shadow global names
        // These include quantifier variables (all x: Sig | ...), let bindings, and parameters
        elements.push(...this.collectLocalVariables(context));

        // Priority 2: Module parameters (e.g., module myModule[Elem])
        elements.push(...this.collectModuleParameters(model));

    // Priority 3: Imported names from open statements (e.g., util/ordering)
    elements.push(...this.collectImportedNames(model, context));

        // Priority 4-6: Global declarations within the module
        elements.push(...this.collectSigNames(model));        // Signature names
        elements.push(...this.collectFieldNames(model));      // Field names  
        elements.push(...this.collectEnumDeclarations(model)); // Enum type names
        elements.push(...this.collectEnumValues(model));      // Enum value names
        elements.push(...this.collectPredicates(model));      // Predicate names
        elements.push(...this.collectFunctions(model));       // Function names
        elements.push(...this.collectAssertions(model));      // Assertion names

        return this.createScope(elements);
    }

    /**
     * Collects names exported by imported modules that are visible at the current reference location.
     * Handles both alias-based imports (open util/ordering as ord) and plain imports.
     */
    private collectImportedNames(model: AlloyModule, context: ReferenceInfo): AstNodeDescription[] {
        if (model.import.length === 0) {
            return [];
        }

        const qualifierSegments = this.getQualifierSegments(context);
        const relevantImports = model.import.filter(imp => this.matchesImportQualifier(imp, qualifierSegments));

        if (relevantImports.length === 0) {
            return [];
        }

        const targetModulePaths = new Set<string>(relevantImports.map(imp => this.modulePathToString(imp.qualName)));
        const modulePathCache = new Map<string, string | null>();
        const result: AstNodeDescription[] = [];

        for (const description of this.indexManager.allElements(NamedElement.$type)) {
            if (!description.documentUri || !description.name) {
                continue;
            }

            const containerType = (description as AstNodeDescription & { containerType?: string }).containerType;
            const isFieldDecl = description.type === 'FieldDecl'
                || (description.type === 'Decl' && containerType === 'FieldDecl');
            if (!isFieldDecl && (!description.type || !IMPORTABLE_TYPES.has(description.type))) {
                continue;
            }

            const uriKey = description.documentUri.toString();
            let modulePath = modulePathCache.get(uriKey);
            if (modulePath === undefined) {
                const document = this.documents.getDocument(description.documentUri);
                if (!document) {
                    modulePathCache.set(uriKey, null);
                    continue;
                }

                const root = document.parseResult?.value;
                if (root && isModuleDecl(root)) {
                    modulePath = this.modulePathToString(root.qualName);
                } else {
                    modulePath = null;
                }
                modulePathCache.set(uriKey, modulePath);
            }

            if (!modulePath || !targetModulePaths.has(modulePath)) {
                continue;
            }

            result.push(description);
        }

        return result;
    }

    private getQualifierSegments(context: ReferenceInfo): string[] | undefined {
        if (isQualName(context.container) && context.reference === context.container.ID) {
            return context.container.names;
        }
        return undefined;
    }

    private matchesImportQualifier(imp: Import, qualifierSegments: string[] | undefined): boolean {
        const moduleSegments = this.modulePathToSegments(imp.qualName);

        if (!qualifierSegments || qualifierSegments.length === 0) {
            // Allow both plain and aliased imports to contribute unqualified names
            return true;
        }

        if (imp.alias && qualifierSegments.length === 1 && qualifierSegments[0] === imp.alias) {
            return true;
        }

        return this.areSegmentsEqual(qualifierSegments, moduleSegments);
    }

    private modulePathToSegments(path: ModulePath): string[] {
        return [...path.names, path.name];
    }

    private modulePathToString(path: ModulePath): string {
        return this.modulePathToSegments(path).join('/');
    }

    private areSegmentsEqual(a: string[], b: string[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        return a.every((segment, index) => segment === b[index]);
    }

    /**
     * Collects local variables that are in scope at the current reference location.
     * Local variables include:
     * - Quantifier variables: all x: Sig | some x.field
     * - Set comprehension variables: {x: Sig | x.field = value}
     * - Function/predicate parameters: pred myPred[x: Sig] { ... }
     * - Let expression bindings: let x = expr | ...
     * 
     * Uses AST traversal upward from the reference point to find variable declarations.
     * Variables declared in inner scopes shadow those in outer scopes.
     * 
     * @param context - Reference context used to walk up the AST tree
     * @returns Array of local variable descriptions
     */
    private collectLocalVariables(context: ReferenceInfo): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];
        let current: AstNode | undefined = context.container;

        // Walk up the AST tree to find all variable-introducing constructs
        // Each if-else branch handles a different type of variable declaration
        while (current) {
            // Branch 1: Quantifier expressions (all, some, no, one, lone)
            // Example: "all x: Person | x.age > 18" - 'x' is a quantifier variable
            if (isQuantExpr(current)) {
                const quantExpr = current as QuantExpr;
                if (quantExpr.decls) {
                    for (const decl of quantExpr.decls) {
                        if (isDecl(decl)) {
                            // Add primary variable name (e.g., 'x' in "all x: Person")
                            if (decl.name && decl.name.name) {
                                elements.push(this.descriptions.createDescription(decl, decl.name.name));
                            }
                            // Add additional variable names (e.g., 'y' in "all x, y: Person")
                            if (decl.additionalNames) {
                                for (const additionalName of decl.additionalNames) {
                                    if (additionalName.name) {
                                        elements.push(this.descriptions.createDescription(decl, additionalName.name));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Branch 2: Set comprehension expressions 
            // Example: "{x: Person | x.age > 18}" - 'x' is a comprehension variable
            else if (isSetExpr(current)) {
                const setExpr = current as SetExpr;
                if (setExpr.decls) {
                    for (const decl of setExpr.decls) {
                        if (isDecl(decl)) {
                            // Add primary variable name
                            if (decl.name && decl.name.name) {
                                elements.push(this.descriptions.createDescription(decl, decl.name.name));
                            }
                            // Add additional variable names
                            if (decl.additionalNames) {
                                for (const additionalName of decl.additionalNames) {
                                    if (additionalName.name) {
                                        elements.push(this.descriptions.createDescription(decl, additionalName.name));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Branch 3: Function declarations with parameters
            // Example: "fun myFunc[x: Person, y: Int]: Bool {...}" - 'x' and 'y' are parameters
            else if (isFunDecl(current)) {
                const funDecl = current as FunDecl;
                if (funDecl.paraDecls && funDecl.paraDecls.decls) {
                    for (const decl of funDecl.paraDecls.decls) {
                        if (isDecl(decl)) {
                            // Add primary parameter name
                            if (decl.name && decl.name.name) {
                                elements.push(this.descriptions.createDescription(decl, decl.name.name));
                            }
                            // Add additional parameter names (e.g., "x, y: Person")
                            if (decl.additionalNames) {
                                for (const additionalName of decl.additionalNames) {
                                    if (additionalName.name) {
                                        elements.push(this.descriptions.createDescription(decl, additionalName.name));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Branch 4: Predicate declarations with parameters  
            // Example: "pred isAdult[x: Person] {...}" - 'x' is a parameter
            else if (isPredDecl(current)) {
                const predDecl = current as PredDecl;
                if (predDecl.paraDecls && predDecl.paraDecls.decls) {
                    for (const decl of predDecl.paraDecls.decls) {
                        if (isDecl(decl)) {
                            // Add primary parameter name
                            if (decl.name && decl.name.name) {
                                elements.push(this.descriptions.createDescription(decl, decl.name.name));
                            }
                            // Add additional parameter names
                            if (decl.additionalNames) {
                                for (const additionalName of decl.additionalNames) {
                                    if (additionalName.name) {
                                        elements.push(this.descriptions.createDescription(decl, additionalName.name));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Branch 5: Let expressions that introduce local bindings
            // Example: "let x = someExpr | x.field" - 'x' is a let-bound variable
            else if (isLetExpr(current)) {
                const letExpr = current as LetExpr;
                if (letExpr.decls) {
                    for (const letDecl of letExpr.decls) {
                        if (letDecl.name) {
                            elements.push(this.descriptions.createDescription(letDecl, letDecl.name));
                        }
                    }
                }
            }
            
            // Move up one level in the AST tree to find variables in outer scopes
            current = current.$container;
        }

        return elements;
    }

    /**
     * Collects module parameters that are available throughout the module.
     * Module parameters are formal parameters declared at the module level.
     * Example: "module myModule[Person, Time]" - 'Person' and 'Time' are module parameters
     * 
     * @param model - The Alloy module to collect parameters from
     * @returns Array of module parameter descriptions
     */
    private collectModuleParameters(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        // Only ModuleDecl instances can have parameters (vs plain AlloyModule)
        // Example: "module util/ordering[Time]" has parameter 'Time'
        if (isModuleDecl(model) && model.params) {
            for (const param of model.params) {
                if (param.name) {
                    elements.push(this.descriptions.createDescription(param, param.name, param.$document));
                }
            }
        }

        return elements;
    }

    /**
     * Collects all signature names declared in the module.
     * Signatures are the main type declarations in Alloy.
     * Example: "sig Person { age: Int }" - 'Person' is a signature name
     * Also handles additional signatures: "sig A, B, C extends Parent"
     * 
     * @param model - The Alloy module to collect signatures from  
     * @returns Array of signature name descriptions
     */
    private collectSigNames(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        // Iterate through all top-level paragraphs in the module
        for (const paragraph of model.paragraph) {
            // Only process signature declarations
            if (paragraph.$type === 'SigDecl') {
                const sigDecl = paragraph as SigDecl;

                // Add the primary signature name (e.g., 'Person' in "sig Person")
                if (sigDecl.name) {
                    elements.push(this.descriptions.createDescription(sigDecl, sigDecl.name, sigDecl.$document));
                }

                // Add additional signatures from comma-separated declarations
                // Example: "sig A, B, C extends Parent" - adds 'B' and 'C'
                if (sigDecl.additionalSigs) {
                    for (const additionalSig of sigDecl.additionalSigs) {
                        elements.push(this.descriptions.createDescription(additionalSig, additionalSig.name, additionalSig.$document));
                    }
                }
            }
        }

        return elements;
    }

    /**
     * Collects all field names declared within signatures.
     * Field names can be referenced in expressions (e.g., person.age).
     * Example: "sig Person { name: String, age: Int }" - 'name' and 'age' are field names
     * 
     * @param model - The Alloy module to collect fields from
     * @returns Array of field name descriptions  
     */
    private collectFieldNames(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        // Look through all signature declarations for field declarations
        for (const paragraph of model.paragraph) {
            if (paragraph.$type === 'SigDecl') {
                const sigDecl = paragraph as SigDecl;
                if (sigDecl.fields) {
                    for (const fieldDecl of sigDecl.fields) {
                        if (fieldDecl.decl) {
                            // Add primary field name (e.g., 'name' in "name: String")
                            if (fieldDecl.decl.name && fieldDecl.decl.name.name) {
                                elements.push(this.descriptions.createDescription(fieldDecl.decl, fieldDecl.decl.name.name));
                            }
                            // Add additional field names from comma-separated declarations
                            // Example: "name, nickname: String" - adds 'nickname'
                            if (fieldDecl.decl.additionalNames) {
                                for (const additionalName of fieldDecl.decl.additionalNames) {
                                    if (additionalName.name) {
                                        elements.push(this.descriptions.createDescription(fieldDecl.decl, additionalName.name));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return elements;
    }

    /**
     * Collects enum type names (not the values, just the enum type itself).
     * Example: "enum Color {RED, GREEN, BLUE}" - 'Color' is the enum declaration
     * These can be used as types in field declarations and expressions.
     * 
     * @param model - The Alloy module to collect enum types from
     * @returns Array of enum type name descriptions
     */
    private collectEnumDeclarations(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        for (const paragraph of model.paragraph) {
            if (paragraph.$type === 'EnumDecl') {
                const enumDecl = paragraph as EnumDecl;
                
                // Add enum type name (e.g., 'Color' from "enum Color {RED, GREEN}")
                if (enumDecl.name) {
                    elements.push(this.descriptions.createDescription(enumDecl, enumDecl.name, enumDecl.$document));
                }
            }
        }

        return elements;
    }

    /**
     * Collects enum value names that can be referenced in expressions.
     * Example: "enum Color {RED, GREEN, BLUE}" - 'RED', 'GREEN', 'BLUE' are enum values
     * These values can be used directly in expressions without qualification.
     * 
     * @param model - The Alloy module to collect enum values from
     * @returns Array of enum value descriptions
     */
    private collectEnumValues(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        for (const paragraph of model.paragraph) {
            if (paragraph.$type === 'EnumDecl') {
                const enumDecl = paragraph as EnumDecl;
                
                // Add individual enum values (e.g., 'RED', 'GREEN' from "enum Color {RED, GREEN}")
                if (enumDecl.values) {
                    for (const value of enumDecl.values) {
                        elements.push(this.descriptions.createDescription(enumDecl, value, enumDecl.$document));
                    }
                }
            }
        }

        return elements;
    }

    /**
     * Collects predicate names that can be called or referenced.
     * Example: "pred isAdult[p: Person] { p.age >= 18 }" - 'isAdult' is a predicate name
     * Predicates can be invoked in expressions and facts.
     * 
     * @param model - The Alloy module to collect predicates from
     * @returns Array of predicate name descriptions
     */
    private collectPredicates(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        for (const paragraph of model.paragraph) {
            if (paragraph.$type === 'PredDecl') {
                const predDecl = paragraph as PredDecl;
                if (predDecl.name) {
                    elements.push(this.descriptions.createDescription(predDecl, predDecl.name));
                }
            }
        }

        return elements;
    }

    /**
     * Collects function names that can be called in expressions.
     * Example: "fun parent[p: Person]: set Person { p.parents }" - 'parent' is a function name
     * Functions return values and can be used in expressions.
     * 
     * @param model - The Alloy module to collect functions from
     * @returns Array of function name descriptions
     */
    private collectFunctions(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        for (const paragraph of model.paragraph) {
            if (paragraph.$type === 'FunDecl') {
                const funDecl = paragraph as FunDecl;
                if (funDecl.name) {
                    elements.push(this.descriptions.createDescription(funDecl, funDecl.name));
                }
            }
        }

        return elements;
    }

    /**
     * Collects assertion names that can be referenced in check commands.
     * Example: "assert noOrphans { all p: Person | some p.parents }" - 'noOrphans' is an assertion
     * Assertions are used to state properties that should hold and can be checked.
     * 
     * @param model - The Alloy module to collect assertions from
     * @returns Array of assertion name descriptions
     */
    private collectAssertions(model: AlloyModule): AstNodeDescription[] {
        const elements: AstNodeDescription[] = [];

        for (const paragraph of model.paragraph) {
            if (paragraph.$type === 'AssertDecl') {
                const assertDecl = paragraph as AssertDecl;
                if (assertDecl.name) {
                    elements.push(this.descriptions.createDescription(assertDecl, assertDecl.name));
                }
            }
        }

        return elements;
    }
}
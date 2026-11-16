/**
 * SMT-LIB 2.7 and Z3 commands: syntax, documentation and completion snippets.
 */

export interface CommandSpec {
    name: string;
    /** Syntax shown in hover and completion details. */
    syntax: string;
    doc: string;
    /** LSP snippet body inserted after `(` (without the surrounding parentheses). */
    snippet: string;
    z3Only?: boolean;
}

export const commandSpecs: CommandSpec[] = [
    // ----- SMT-LIB 2.7 -----
    { name: 'assert', syntax: '(assert ⟨term⟩)', snippet: 'assert ${1:term}', doc: 'Adds a Boolean term to the current assertion level.' },
    { name: 'check-sat', syntax: '(check-sat)', snippet: 'check-sat', doc: 'Checks whether the conjunction of all current assertions is satisfiable. Answers `sat`, `unsat` or `unknown`.' },
    { name: 'check-sat-assuming', syntax: '(check-sat-assuming (⟨term⟩*))', snippet: 'check-sat-assuming (${1:literal})', doc: 'Like `check-sat`, but additionally assumes the given Boolean terms for this check only (SMT-LIB 2.7 allows arbitrary Boolean terms).' },
    { name: 'declare-const', syntax: '(declare-const ⟨symbol⟩ ⟨sort⟩)', snippet: 'declare-const ${1:name} ${2:Int}', doc: 'Declares a new constant symbol of the given sort. Same as `(declare-fun f () σ)`.' },
    { name: 'declare-datatype', syntax: '(declare-datatype ⟨symbol⟩ ⟨datatype_dec⟩)', snippet: 'declare-datatype ${1:Name} ((${2:ctor} (${3:selector} ${4:Int}))))', doc: 'Declares a single (possibly recursive and parametric) algebraic datatype together with its constructors, selectors and testers.' },
    { name: 'declare-datatypes', syntax: '(declare-datatypes ((⟨symbol⟩ ⟨numeral⟩)ⁿ⁺¹) (⟨datatype_dec⟩ⁿ⁺¹))', snippet: 'declare-datatypes ((${1:Name} 0)) (((${2:ctor} (${3:selector} ${4:Int})))))', doc: 'Declares one or more mutually recursive algebraic datatypes. Z3 also accepts the legacy form `(declare-datatypes (T*) ((Name ctor+)+))`.' },
    { name: 'declare-fun', syntax: '(declare-fun ⟨symbol⟩ (⟨sort⟩*) ⟨sort⟩)', snippet: 'declare-fun ${1:f} (${2:Int}) ${3:Int}', doc: 'Declares a new uninterpreted function symbol with the given argument sorts and result sort.' },
    { name: 'declare-sort', syntax: '(declare-sort ⟨symbol⟩ ⟨numeral⟩)', snippet: 'declare-sort ${1:S} ${2:0}', doc: 'Declares a new uninterpreted sort symbol with the given arity. Z3 allows omitting the arity (default 0).' },
    { name: 'declare-sort-parameter', syntax: '(declare-sort-parameter ⟨symbol⟩)', snippet: 'declare-sort-parameter ${1:A}', doc: 'Declares a global sort parameter, enabling prenex polymorphism in assertions (SMT-LIB 2.7).' },
    { name: 'define-const', syntax: '(define-const ⟨symbol⟩ ⟨sort⟩ ⟨term⟩)', snippet: 'define-const ${1:name} ${2:Int} ${3:term}', doc: 'Defines a constant symbol as an abbreviation of a term (SMT-LIB 2.7, Z3).' },
    { name: 'define-fun', syntax: '(define-fun ⟨symbol⟩ (⟨sorted_var⟩*) ⟨sort⟩ ⟨term⟩)', snippet: 'define-fun ${1:f} ((${2:x} ${3:Int})) ${4:Int} ${5:body}', doc: 'Defines a (non-recursive) function symbol by a term over its parameters.' },
    { name: 'define-fun-rec', syntax: '(define-fun-rec ⟨symbol⟩ (⟨sorted_var⟩*) ⟨sort⟩ ⟨term⟩)', snippet: 'define-fun-rec ${1:f} ((${2:x} ${3:Int})) ${4:Int} ${5:body}', doc: 'Defines a recursive function symbol; the body may refer to the function itself.' },
    { name: 'define-funs-rec', syntax: '(define-funs-rec (⟨function_dec⟩ⁿ⁺¹) (⟨term⟩ⁿ⁺¹))', snippet: 'define-funs-rec ((${1:f} ((${2:x} ${3:Int})) ${4:Int})) (${5:body})', doc: 'Defines several mutually recursive functions. The i-th body defines the i-th function.' },
    { name: 'define-sort', syntax: '(define-sort ⟨symbol⟩ (⟨symbol⟩*) ⟨sort⟩)', snippet: 'define-sort ${1:Name} (${2}) ${3:Int}', doc: 'Defines a sort symbol as an abbreviation of a (possibly parametric) sort expression.' },
    { name: 'echo', syntax: '(echo ⟨string⟩)', snippet: 'echo "${1}"', doc: 'Prints the given string literal.' },
    { name: 'exit', syntax: '(exit)', snippet: 'exit', doc: 'Instructs the solver to exit.' },
    { name: 'get-assertions', syntax: '(get-assertions)', snippet: 'get-assertions', doc: 'Returns the current assertions (requires `:produce-assertions`).' },
    { name: 'get-assignment', syntax: '(get-assignment)', snippet: 'get-assignment', doc: 'Returns the truth values of all `:named` Boolean terms after a `sat` answer (requires `:produce-assignments`).' },
    { name: 'get-info', syntax: '(get-info ⟨info_flag⟩)', snippet: 'get-info :${1:reason-unknown}', doc: 'Returns solver information such as `:name`, `:version`, `:reason-unknown` or `:all-statistics`.' },
    { name: 'get-model', syntax: '(get-model)', snippet: 'get-model', doc: 'Returns a model for the current assertions after a `sat` answer (requires `:produce-models`).' },
    { name: 'get-option', syntax: '(get-option ⟨keyword⟩)', snippet: 'get-option :${1:produce-models}', doc: 'Returns the current value of a solver option.' },
    { name: 'get-proof', syntax: '(get-proof)', snippet: 'get-proof', doc: 'Returns a proof of unsatisfiability after an `unsat` answer (requires `:produce-proofs`).' },
    { name: 'get-unsat-assumptions', syntax: '(get-unsat-assumptions)', snippet: 'get-unsat-assumptions', doc: 'Returns a subset of the assumptions of the last `check-sat-assuming` that is sufficient for unsatisfiability (requires `:produce-unsat-assumptions`).' },
    { name: 'get-unsat-core', syntax: '(get-unsat-core)', snippet: 'get-unsat-core', doc: 'Returns the names of `:named` assertions forming an unsatisfiable core after an `unsat` answer (requires `:produce-unsat-cores`).' },
    { name: 'get-value', syntax: '(get-value (⟨term⟩+))', snippet: 'get-value (${1:term})', doc: 'Returns the values of the given terms in the current model (requires `:produce-models`).' },
    { name: 'pop', syntax: '(pop ⟨numeral⟩)', snippet: 'pop ${1:1}', doc: 'Pops the given number of assertion levels, removing their assertions and declarations. Z3 allows omitting the numeral (default 1).' },
    { name: 'push', syntax: '(push ⟨numeral⟩)', snippet: 'push ${1:1}', doc: 'Pushes the given number of empty assertion levels. Z3 allows omitting the numeral (default 1).' },
    { name: 'reset', syntax: '(reset)', snippet: 'reset', doc: 'Resets the solver completely, removing all assertions, declarations and option settings.' },
    { name: 'reset-assertions', syntax: '(reset-assertions)', snippet: 'reset-assertions', doc: 'Removes all assertions and assertion levels; declarations are removed too unless `:global-declarations` is true.' },
    { name: 'set-info', syntax: '(set-info ⟨attribute⟩)', snippet: 'set-info :${1:status} ${2:sat}', doc: 'Sets benchmark meta information such as `:status`, `:source` or `:smt-lib-version`.' },
    { name: 'set-logic', syntax: '(set-logic ⟨symbol⟩)', snippet: 'set-logic ${1:ALL}', doc: 'Sets the logic, which determines the available theory sorts and functions.' },
    { name: 'set-option', syntax: '(set-option ⟨option⟩)', snippet: 'set-option :${1:produce-models} ${2:true}', doc: 'Sets a solver option, e.g. `:produce-models true` or a Z3 parameter such as `:smt.mbqi false`.' },
    // ----- Z3 -----
    { name: 'assert-soft', syntax: '(assert-soft ⟨term⟩ [:weight ⟨numeral⟩] [:id ⟨symbol⟩])', snippet: 'assert-soft ${1:term} :weight ${2:1}', doc: 'Z3 optimization: adds a soft constraint with an optional weight and objective group id.', z3Only: true },
    { name: 'maximize', syntax: '(maximize ⟨term⟩)', snippet: 'maximize ${1:term}', doc: 'Z3 optimization: adds an objective to maximize.', z3Only: true },
    { name: 'minimize', syntax: '(minimize ⟨term⟩)', snippet: 'minimize ${1:term}', doc: 'Z3 optimization: adds an objective to minimize.', z3Only: true },
    { name: 'get-objectives', syntax: '(get-objectives)', snippet: 'get-objectives', doc: 'Z3 optimization: returns the values of the objectives after `check-sat`.', z3Only: true },
    { name: 'eval', syntax: '(eval ⟨term⟩ ⟨attribute⟩*)', snippet: 'eval ${1:term}', doc: 'Z3: evaluates a term in the current model (e.g. `:completion true`).', z3Only: true },
    { name: 'simplify', syntax: '(simplify ⟨term⟩ ⟨attribute⟩*)', snippet: 'simplify ${1:term}', doc: 'Z3: prints a simplified version of the term; rewriter parameters can be given as attributes.', z3Only: true },
    { name: 'display', syntax: '(display ⟨term⟩)', snippet: 'display ${1:term}', doc: 'Z3: pretty-prints the term.', z3Only: true },
    { name: 'check-sat-using', syntax: '(check-sat-using ⟨tactic⟩ ⟨attribute⟩*)', snippet: 'check-sat-using ${1:smt}', doc: 'Z3: checks satisfiability using the given tactic, e.g. `(then simplify solve-eqs smt)`.', z3Only: true },
    { name: 'apply', syntax: '(apply ⟨tactic⟩ ⟨attribute⟩*)', snippet: 'apply ${1:simplify}', doc: 'Z3: applies a tactic to the current assertions and prints the resulting goals.', z3Only: true },
    { name: 'declare-rel', syntax: '(declare-rel ⟨symbol⟩ (⟨sort⟩*))', snippet: 'declare-rel ${1:R} (${2:Int})', doc: 'Z3 fixedpoint: declares a relation (a Boolean-valued function) for Horn clause solving.', z3Only: true },
    { name: 'declare-var', syntax: '(declare-var ⟨symbol⟩ ⟨sort⟩)', snippet: 'declare-var ${1:x} ${2:Int}', doc: 'Z3 fixedpoint: declares a variable that is implicitly universally quantified in rules.', z3Only: true },
    { name: 'rule', syntax: '(rule ⟨term⟩ [⟨symbol⟩])', snippet: 'rule ${1:term}', doc: 'Z3 fixedpoint: adds a Horn rule.', z3Only: true },
    { name: 'query', syntax: '(query ⟨term⟩ ⟨attribute⟩*)', snippet: 'query ${1:R}', doc: 'Z3 fixedpoint: checks whether the query relation or formula is derivable.', z3Only: true },
    { name: 'get-consequences', syntax: '(get-consequences (⟨term⟩*) (⟨term⟩*))', snippet: 'get-consequences (${1}) (${2})', doc: 'Z3: computes consequences of the assumptions over the given variables.', z3Only: true },
    { name: 'set-initial-value', syntax: '(set-initial-value ⟨term⟩ ⟨term⟩)', snippet: 'set-initial-value ${1:x} ${2:value}', doc: 'Z3: sets an initial value (phase hint) for a variable.', z3Only: true },
    { name: 'declare-type-var', syntax: '(declare-type-var ⟨symbol⟩)', snippet: 'declare-type-var ${1:A}', doc: 'Z3: declares a type variable for polymorphic declarations.', z3Only: true },
];

/**
 * Further Z3 commands without dedicated grammar rules. They are parsed as generic
 * commands with s-expression arguments and accepted by the validator.
 */
export const otherZ3Commands: Record<string, string> = {
    'assert-not': 'Asserts the negation of a term.',
    'assume': 'Adds an assumption.',
    'declare-map': 'Declares a map function over arrays.',
    'declare-tactic': 'Declares a named tactic: `(declare-tactic name tactic)`.',
    'del': 'Deletes a declared symbol.',
    'display-dimacs': 'Displays the assertions in DIMACS format.',
    'get-interpolant': 'Computes an interpolant.',
    'get-proof-graph': 'Displays the proof as a graph.',
    'get-user-tactics': 'Lists user-declared tactics.',
    'help': 'Displays the list of available commands.',
    'help-tactic': 'Displays help for tactics.',
    'help-simplifier': 'Displays help for simplifiers.',
    'include': 'Includes another SMT-LIB file: `(include "file.smt2")`.',
    'labels': 'Displays the labels of the last model.',
    'model-add': 'Adds a definition to the model converter.',
    'model-del': 'Removes a definition from the model converter.',
    'prefer': 'Adds a preference for the optimization solver.',
    'reset-preferences': 'Removes all preferences.',
    'set-simplifier': 'Sets the pre-processing simplifier.',
    'infer': 'Infers consequences (experimental).',
    'mbp': 'Model-based projection (debugging).',
    'mbp-qel': 'Model-based projection with QEL (debugging).',
    'mbi': 'Model-based interpolation (debugging).',
    'qe-lite': 'Lightweight quantifier elimination (debugging).',
    'qel': 'Quantifier elimination lite (debugging).',
    'euf-project': 'EUF projection (debugging).',
    'eufi': 'EUF interpolation (debugging).',
    'to-poly': 'Converts to a polynomial (debugging).',
    'to-subpaving': 'Converts to subpaving (debugging).',
    'instantiate': 'Instantiates a quantifier (debugging).',
    'instantiate-nested': 'Instantiates nested quantifiers (debugging).',
    'get-quantifier-body': 'Prints the body of a quantifier (debugging).',
    'ff-certify': 'Finite field certificate generation.',
    'ff-boolean-certify': 'Finite field Boolean certificate generation.',
    'ff-check-native-proof': 'Checks a native finite field proof.',
    'ff-integrated-certify': 'Integrated finite field certification.',
    'fixedpoint-push': 'Pushes a fixedpoint scope.',
    'fixedpoint-pop': 'Pops a fixedpoint scope.',
};

export function findCommandSpec(name: string): CommandSpec | undefined {
    return commandSpecs.find(c => c.name === name);
}

export function isKnownGenericCommand(name: string): boolean {
    return name in otherZ3Commands || name.startsWith('dbg-');
}

/******************************************************************************
 * SMT-LIB 2.7 script grammar with Z3 extensions.
 *
 * Reference: The SMT-LIB Standard, Version 2.7, Appendix B (Concrete Syntax)
 * and Z3's SMT2 front end (src/parsers/smt2/smt2parser.cpp, smt2scanner.cpp).
 *
 * Design notes
 *  - Theory symbols (and, bvadd, str.++, select, Int, Array, ...) are NOT keywords.
 *    They are ordinary symbols resolved against the builtin library (see builtins/),
 *    exactly like user-declared symbols. This keeps the grammar small and lets the
 *    same symbol be used freely in s-expressions, attributes and tactics.
 *  - Keywords of this grammar are the reserved words of SMT-LIB (binders and command
 *    names) plus a few Z3 command names. Z3 command names are not reserved in Z3,
 *    so they are accepted as symbols as well (see rule SmtSymbol).
 *  - Function-like and sort-like declarations live in separate namespaces, mirroring
 *    SMT-LIB where a symbol can be both a sort and a function.
 ******************************************************************************/
grammar Smt

/** Everything a term-level identifier can refer to. */
type FunctionSymbol =
      DeclareConst | DeclareFun | DefineConst | FunctionDef | FunctionDec
    | ConstructorDec | SelectorDec | SortedVar | VarBinding | PatternVariable
    | NamedAttribute | DeclareRel | DeclareVar;

/** Everything a sort identifier can refer to. */
type SortSymbol =
      DeclareSort | DefineSort | DeclareDatatype | SortDec | LegacyDatatypeDec
    | SortParameter | DeclareSortParameter | DeclareTypeVar;

entry Script:
    commands+=Command*;

/******************************************************************************
 * Commands
 ******************************************************************************/

Command:
      Assert
    | CheckSat
    | CheckSatAssuming
    | DeclareConst
    | DeclareDatatype
    | DeclareDatatypes
    | DeclareFun
    | DeclareSort
    | DeclareSortParameter
    | DefineConst
    | DefineFun
    | DefineFunsRec
    | DefineSort
    | Echo
    | GetInfo
    | GetOption
    | GetValue
    | Push
    | Pop
    | SetInfo
    | SetLogic
    | SetOption
    | SimpleCommand
    // Z3 extensions
    | TermCommand
    | FixedpointRule
    | Objective
    | TacticCommand
    | DeclareRel
    | DeclareVar
    | GetConsequences
    | SetInitialValue
    | DeclareTypeVar
    | GenericCommand;

Assert:
    '(' 'assert' term=Term ')';

CheckSat:
    {infer CheckSat} '(' 'check-sat' ')';

/** SMT-LIB 2.7 accepts arbitrary Boolean terms as assumptions. */
CheckSatAssuming:
    '(' 'check-sat-assuming' '(' assumptions+=Term* ')' ')';

DeclareConst:
    '(' 'declare-const' name=SmtSymbol sort=Sort ')';

DeclareFun:
    '(' 'declare-fun' name=SmtSymbol '(' parameters+=Sort* ')' sort=Sort ')';

/** `(declare-sort s n)`; Z3 allows omitting the arity (defaults to 0). */
DeclareSort:
    '(' 'declare-sort' name=SmtSymbol arity=NUMERAL? ')';

/** SMT-LIB 2.7 global sort parameter for prenex polymorphism. */
DeclareSortParameter:
    '(' 'declare-sort-parameter' name=SmtSymbol ')';

/** SMT-LIB 2.7 / Z3. */
DefineConst:
    '(' 'define-const' name=SmtSymbol sort=Sort value=Term ')';

DefineFun:
    '(' kind=('define-fun' | 'define-fun-rec') definition=FunctionDef ')';

FunctionDef:
    name=SmtSymbol '(' parameters+=SortedVar* ')' sort=Sort body=Term;

DefineFunsRec:
    '(' 'define-funs-rec' '(' declarations+=FunctionDec+ ')' '(' bodies+=Term+ ')' ')';

FunctionDec:
    '(' name=SmtSymbol '(' parameters+=SortedVar* ')' sort=Sort ')';

DefineSort:
    '(' 'define-sort' name=SmtSymbol '(' parameters+=SortParameter* ')' sort=Sort ')';

/**
 * `(declare-datatype d datatype_dec)`; Z3 additionally accepts `:subterm name`.
 * The command itself declares the sort `d`.
 */
DeclareDatatype:
    '(' 'declare-datatype' name=SmtSymbol datatype=DatatypeDec (':subterm' subterm=SmtSymbol)? ')';

/**
 * SMT-LIB 2.6+:  (declare-datatypes ((d1 k1) ... (dn kn)) (dt_dec1 ... dt_decn))
 * Z3 legacy:     (declare-datatypes (T1 ... Tk) ((d1 ctor+) ... (dn ctor+)))
 */
DeclareDatatypes:
      '(' 'declare-datatypes' '(' sorts+=SortDec+ ')' '(' datatypes+=DatatypeDec+ ')' ')'
    | '(' 'declare-datatypes' legacy?='(' parameters+=SortParameter* ')' '(' legacyDatatypes+=LegacyDatatypeDec* ')' ')';

SortDec:
    '(' name=SmtSymbol arity=NUMERAL ')';

DatatypeDec:
      '(' 'par' '(' parameters+=SortParameter+ ')' '(' constructors+=ConstructorDec+ ')' ')'
    | '(' constructors+=ConstructorDec+ ')';

LegacyDatatypeDec:
    '(' name=SmtSymbol constructors+=ConstructorDec+ ')';

/** Z3 accepts a bare symbol for a constructor without selectors. */
ConstructorDec:
      '(' name=SmtSymbol selectors+=SelectorDec* ')'
    | name=SmtSymbol;

SelectorDec:
    '(' name=SmtSymbol sort=Sort ')';

SortParameter:
    name=SmtSymbol;

Echo:
    '(' 'echo' text=STRING ')';

GetInfo:
    '(' 'get-info' flag=Keyword ')';

GetOption:
    '(' 'get-option' option=Keyword ')';

GetValue:
    '(' 'get-value' '(' terms+=Term+ ')' ')';

/** The numeral is optional in Z3 (defaults to 1). */
Push:
    '(' 'push' levels=NUMERAL? ')';

Pop:
    '(' 'pop' levels=NUMERAL? ')';

SetInfo:
    '(' 'set-info' attribute=Attribute ')';

SetLogic:
    '(' 'set-logic' logic=SmtSymbol ')';

SetOption:
    '(' 'set-option' attribute=Attribute ')';

SimpleCommand:
    '(' name=SimpleCommandName ')';

SimpleCommandName returns string:
      'exit' | 'get-assertions' | 'get-assignment' | 'get-model' | 'get-proof'
    | 'get-unsat-assumptions' | 'get-unsat-core' | 'reset' | 'reset-assertions'
    // Z3
    | 'get-objectives';

/******************************************************************************
 * Z3 commands that contain terms or declarations
 ******************************************************************************/

/** `(eval t :opt v ...)`, `(simplify t ...)`, `(assert-soft t :weight w :id g)`, `(display t)`, `(query r ...)`. */
TermCommand:
    '(' name=TermCommandName term=Term attributes+=Attribute* ')';

TermCommandName returns string:
    'eval' | 'simplify' | 'assert-soft' | 'display' | 'query';

/** Z3 fixedpoint rule: `(rule t name?)`. */
FixedpointRule:
    '(' 'rule' term=Term ruleName=SmtSymbol? ')';

/** `(maximize t)` / `(minimize t)` with optional attributes such as `:id`. */
Objective:
    '(' direction=('maximize' | 'minimize') term=Term attributes+=Attribute* ')';

/** `(check-sat-using tactic ...)`, `(apply tactic ...)`. Tactics are s-expressions. */
TacticCommand:
    '(' name=('check-sat-using' | 'apply') tactic=SExpr attributes+=Attribute* ')';

/** Z3 fixedpoint relation declaration: `(declare-rel r (Int Int))`. */
DeclareRel:
    '(' 'declare-rel' name=SmtSymbol '(' parameters+=Sort* ')' attributes+=Attribute* ')';

/** Z3 fixedpoint variable declaration: `(declare-var x Int)`. */
DeclareVar:
    '(' 'declare-var' name=SmtSymbol sort=Sort ')';

/** `(get-consequences (assumptions) (variables))`. */
GetConsequences:
    '(' 'get-consequences' '(' assumptions+=Term* ')' '(' variables+=Term* ')' ')';

/** `(set-initial-value x v)` (Z3 phase/value hints). */
SetInitialValue:
    '(' 'set-initial-value' variable=Term value=Term ')';

/** `(declare-type-var A)` (Z3 polymorphism). */
DeclareTypeVar:
    '(' 'declare-type-var' name=SmtSymbol ')';

/**
 * Any other command. Known Z3 commands (help, get-info-like queries, tactics, ...)
 * are accepted by the validator; anything else is reported as unknown.
 */
GenericCommand:
    '(' name=SIMPLE_SYMBOL arguments+=SExpr* ')';

/******************************************************************************
 * Sorts
 ******************************************************************************/

Sort:
    SortIdentifier | ParametricSort;

SortIdentifier:
    SimpleSort | IndexedSort;

SimpleSort:
    symbol=[SortSymbol:SmtSymbol];

IndexedSort:
    '(' '_' symbol=[SortSymbol:SmtSymbol] indices+=Index+ ')';

/** Z3 also accepts a parenthesized nullary sort such as `(U)`. */
ParametricSort:
    '(' identifier=SortIdentifier arguments+=Sort* ')';

/** Numerals, symbols and (Z3) hexadecimals/binaries or nested s-expressions, e.g. `(_ map (+ (Int Int) Int))`. */
Index:
      {infer NumeralIndex} value=NUMERAL
    | {infer SymbolIndex} value=SmtSymbol
    | {infer BitVectorIndex} value=(HEXADECIMAL | BINARY)
    | {infer ListIndex} '(' items+=SExpr* ')';

/******************************************************************************
 * Terms
 ******************************************************************************/

/**
 * All parenthesized term forms are inlined into this one rule so that every nesting
 * level costs a single rule invocation. Machine-generated benchmarks nest terms
 * hundreds of levels deep and the parser is recursive.
 */
Term:
      {infer NumeralConstant} value=NUMERAL
    | {infer DecimalConstant} value=DECIMAL
    | {infer HexadecimalConstant} value=HEXADECIMAL
    | {infer BinaryConstant} value=BINARY
    | {infer StringConstant} value=STRING
    | {infer SimpleIdentifier} symbol=[FunctionSymbol:SmtSymbol]
    | '(' (
          {infer IndexedIdentifier} '_' symbol=[FunctionSymbol:SmtSymbol] indices+=Index+
        | {infer QualifiedIdentifier} 'as' identifier=Identifier sort=Sort
        | {infer LetTerm} 'let' '(' bindings+=VarBinding+ ')' body=Term
        | {infer QuantifiedTerm} quantifier=('forall' | 'exists') '(' variables+=SortedVar+ ')' body=Term
        | {infer LambdaTerm} 'lambda' '(' variables+=SortedVar+ ')' body=Term
        | {infer MatchTerm} 'match' term=Term '(' cases+=MatchCase+ ')'
        | {infer AnnotatedTerm} '!' term=Term attributes+=TermAttribute+
        | {infer Application} function=QualIdentifier arguments+=Term+
      ) ')';

type SpecConstant = NumeralConstant | DecimalConstant | HexadecimalConstant | BinaryConstant | StringConstant;

/** Head of an application: `f`, `(_ extract 7 0)` or `(as const (Array Int Int))`. */
QualIdentifier:
    Identifier | QualifiedIdentifier;

Identifier:
    SimpleIdentifier | IndexedIdentifier;

SimpleIdentifier:
    symbol=[FunctionSymbol:SmtSymbol];

IndexedIdentifier:
    '(' '_' symbol=[FunctionSymbol:SmtSymbol] indices+=Index+ ')';

/** `(as nil (List Int))` */
QualifiedIdentifier:
    '(' 'as' identifier=Identifier sort=Sort ')';

VarBinding:
    '(' name=SmtSymbol value=Term ')';

SortedVar:
    '(' name=SmtSymbol sort=Sort ')';

MatchCase:
    '(' pattern=Pattern body=Term ')';

/**
 * A bare symbol pattern is either a nullary constructor or a variable binding;
 * this is decided during scoping (see SmtScopeProvider). `_` is a wildcard (2.7).
 */
Pattern:
      ConstructorPattern
    | PatternVariable;

ConstructorPattern:
    '(' constructorSymbol=[FunctionSymbol:SmtSymbol] arguments+=PatternVariable+ ')';

PatternVariable:
    name=(SmtSymbol | '_');

TermAttribute:
      NamedAttribute
    | PatternAttribute
    | {infer Attribute} keyword=(KEYWORD | ':subterm') value=AttributeValue?;

/** In-line definition `(! t :named n)`: declares `n` as a nullary function. */
NamedAttribute:
    ':named' name=SmtSymbol;

/** Quantifier instantiation patterns: `:pattern (t+)`, `:pattern ()` (2.7) and Z3's `:no-pattern t`. */
PatternAttribute:
      key=':pattern' '(' terms+=Term* ')'
    | key=':no-pattern' terms+=Term;

/******************************************************************************
 * Attributes and s-expressions
 ******************************************************************************/

Attribute:
    keyword=Keyword value=AttributeValue?;

AttributeValue:
      {infer SExprConstant} value=SpecConstantValue
    | {infer SExprSymbol} value=AnySymbol
    | {infer SExprList} '(' items+=SExpr* ')';

SExpr:
      {infer SExprConstant} value=SpecConstantValue
    | {infer SExprSymbol} value=AnySymbol
    | {infer SExprKeyword} value=Keyword
    | {infer SExprList} '(' items+=SExpr* ')';

SpecConstantValue returns string:
    NUMERAL | DECIMAL | HEXADECIMAL | BINARY | STRING;

Keyword returns string:
    KEYWORD | ':named' | ':pattern' | ':no-pattern' | ':subterm';

/**
 * A user symbol. Includes Z3 command names, which Z3 does not reserve.
 * Quoted symbols `|...|` are unquoted by the value converter, so `|x|` and `x` are equal.
 */
SmtSymbol returns string:
      SIMPLE_SYMBOL | QUOTED_SYMBOL
    | 'eval' | 'simplify' | 'assert-soft' | 'display' | 'query' | 'rule'
    | 'maximize' | 'minimize' | 'check-sat-using' | 'apply'
    | 'declare-rel' | 'declare-var' | 'get-consequences' | 'set-initial-value'
    | 'declare-type-var' | 'get-objectives'
    // `lambda` is reserved since SMT-LIB 2.7, but Z3 and older scripts use it as a name.
    | 'lambda';

/** Any symbol including SMT-LIB reserved words, as allowed inside s-expressions. */
AnySymbol returns string:
      SmtSymbol | '_' | '!' | 'as' | 'let' | 'forall' | 'exists' | 'lambda' | 'match'
    | 'assert' | 'check-sat' | 'check-sat-assuming' | 'declare-const' | 'declare-datatype'
    | 'declare-datatypes' | 'declare-fun' | 'declare-sort' | 'declare-sort-parameter'
    | 'define-const' | 'define-fun' | 'define-fun-rec' | 'define-funs-rec' | 'define-sort'
    | 'echo' | 'get-info' | 'get-option' | 'get-value' | 'push' | 'pop' | 'set-info'
    | 'set-logic' | 'set-option' | 'par' | SimpleCommandName;

/******************************************************************************
 * Lexical structure
 ******************************************************************************/

hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /;[^\n\r]*/;
/** Z3 extension: block comments `#| ... |#`. */
hidden terminal ML_COMMENT: /#\|[\s\S]*?\|#/;

/** Z3 reads `-5` and `-1.5` as negative numbers; `1.` is a decimal. */
terminal DECIMAL: /-?[0-9]+\.[0-9]*/;
terminal NUMERAL: /-?[0-9]+/;
terminal HEXADECIMAL: /#x[0-9a-fA-F]+/;
terminal BINARY: /#b[01]+/;
/** The only escape sequence is `""` (SMT-LIB 2.5+). Strings may span lines. */
terminal STRING: /"(?:[^"]|"")*"/;
/** `|...|` may contain anything but `|` and `\`, including line breaks. */
terminal QUOTED_SYMBOL: /\|[^|\\]*\|/;
/** Z3 also allows `,` in simple symbols and keywords (`smt2scanner.cpp`). */
terminal KEYWORD: /:[a-zA-Z0-9~!@$%^&*_\-+=<>.?\/,]+/;
terminal SIMPLE_SYMBOL: /[a-zA-Z~!@$%^&*_\-+=<>.?\/,][a-zA-Z0-9~!@$%^&*_\-+=<>.?\/,]*/;

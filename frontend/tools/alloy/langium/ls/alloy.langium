grammar Alloy

// Reference: org.alloytools.alloy.core/parser/Alloy.cup, Alloy.lex and CompFilter.java

type NamedElement = SigDecl | AdditionalSig | PredDecl | FunDecl | FactDecl | AssertDecl | DeclName | LetDecl | EnumDecl | EnumValue | MacroDecl | MacroParam | ModuleParam;

entry AlloyModule:
    ModuleDecl? import+=Import* paragraph+=Paragraph*;

ModuleDecl:
    'module' qualName=ModulePath ('[' params+=ModuleParam (',' params+=ModuleParam)* ']')?;

ModuleParam:
    exactly?='exactly'? name=ID;

Import:
    private?='private'? 'open' qualName=ModulePath ('[' (args+=QualName (',' args+=QualName)*)? ']')? ('as' alias=ID)?;

Paragraph:
    SigDecl | FactDecl | PredDecl | FunDecl | AssertDecl | CmdDecl | EnumDecl | MacroDecl;

MacroDecl:
    private?='private'? 'let' name=ID
    ('(' (params+=MacroParam (',' params+=MacroParam)*)? ')' | '[' (params+=MacroParam (',' params+=MacroParam)*)? ']')?
    ('=' expr=Expr | expr=Block);

MacroParam:
    name=ID;

// Sig qualifiers may appear in any order; the validator rejects repeated ones.
SigDecl:
    qualifiers+=SigQualifier* 'sig' name=ID (',' additionalSigs+=AdditionalSig)* sigExt=SigExt?
    '{' fields+=FieldDecl? (',' fields+=FieldDecl?)* '}' block=Block?;

SigQualifier returns string:
    'abstract' | 'private' | 'var' | MULT;

AdditionalSig:
    name=ID;

// 'extends' takes a single parent; 'in' and '=' take a union of parents.
SigExt:
    keyword='extends' parent=QualName
    | keyword=('in' | '=') parent=QualName ('+' additionalParents+=QualName)*;

FieldDecl:
    var?='var'? private?='private'? decl=Decl;

// A declaration either bounds its names (x: e) or defines them (x = e).
Decl:
    disj?='disj'? names+=DeclName (',' names+=DeclName)* (':' disjExpr?='disj'? expr=Expr | defined?='=' expr=Expr);

// Set comprehensions do not allow defined declarations.
BoundDecl infers Decl:
    disj?='disj'? names+=DeclName (',' names+=DeclName)* ':' disjExpr?='disj'? expr=Expr;

DeclName:
    name=ID;

FactDecl:
    'fact' name=(ID | STRING)? block=Block;

PredDecl:
    private?='private'? 'pred' (qualifier=QualName '.')? name=ID paraDecls=ParaDecls? block=Block;

FunDecl:
    private?='private'? 'fun' (qualifier=QualName '.')? name=ID paraDecls=ParaDecls? ':' returnType=Expr block=Block;

ParaDecls:
    '(' (decls+=Decl (',' decls+=Decl)*)? ')' | '[' (decls+=Decl (',' decls+=Decl)*)? ']';

AssertDecl:
    'assert' name=(ID | STRING)? block=Block;

EnumDecl:
    private?='private'? 'enum' name=ID '{' (values+=EnumValue (',' values+=EnumValue)*)? '}';

EnumValue:
    name=ID;

// "l: run p" names the command l; "l: run n {...}" is not valid Alloy.
CmdDecl:
    (name=CMD_LABEL kind=('run' | 'check') (block=Block | predicate=QualName)
    | kind=('run' | 'check') (name=ID? block=Block | predicate=QualName))
    scope=Scope?
    ('expect' expectNum=INT)? (('=>' | 'implies') chainedCmd=CmdDecl)?;

Scope:
    'for' number=INT ('but' typeScopes+=TypeScope (',' typeScopes+=TypeScope)*)?
    | 'for' typeScopes+=TypeScope (',' typeScopes+=TypeScope)*;

// n | n..m | n.. | n..m:i | n:i  (an open range has range=true and no endNumber)
TypeScope:
    exactly?='exactly'? number=INT (range?='..' (endNumber=INT (':' stepNumber=INT)?)? | ':' stepNumber=INT)?
    (type=QualName | seq?='seq');


// ---------------------------------------------------------------------------
// Expressions, from lowest to highest precedence (mirrors Alloy.cup).
// Quantifiers and let are primary expressions whose body extends as far right
// as possible, which matches Alloy's "Bind" productions.
// ---------------------------------------------------------------------------

Expr:
    SequenceExpr;

// a ; b  means  a and after b  (right associative)
SequenceExpr infers Expr:
    DisjunctionExpr ({infer SequenceExpr.left=current} ';' right=SequenceExpr)?;

DisjunctionExpr infers Expr:
    BiImplicationExpr ({infer DisjunctionExpr.left=current} ('||' | 'or') right=BiImplicationExpr)*;

BiImplicationExpr infers Expr:
    ImplicationExpr ({infer BiImplicationExpr.left=current} ('<=>' | 'iff') right=ImplicationExpr)*;

// Right associative; a dangling else binds to the nearest implication.
ImplicationExpr infers Expr:
    ConjunctionExpr ({infer ImplicationExpr.left=current} ('=>' | 'implies') right=ImplicationExpr ('else' elseExpr=ImplicationExpr)?)?;

ConjunctionExpr infers Expr:
    BinaryTemporalExpr ({infer ConjunctionExpr.left=current} ('&&' | 'and') right=BinaryTemporalExpr)*;

BinaryTemporalExpr infers Expr:
    UnaryLogicalExpr ({infer BinaryTemporalExpr.left=current} op=('until' | 'releases' | 'since' | 'triggered') right=UnaryLogicalExpr)*;

UnaryLogicalExpr infers Expr:
    {infer UnaryLogicalExpr} op=('!' | 'not' | 'always' | 'eventually' | 'after' | 'before' | 'historically' | 'once') expr=UnaryLogicalExpr
    | ComparisonExpr;

// Multiplicity prefixes share the comparison level: "no a = b" is "(no a) = b".
ComparisonExpr infers Expr:
    ({infer UnaryMultExpr} op=('no' | 'some' | 'lone' | 'one' | 'set' | 'seq') expr=ShiftExpr | ShiftExpr)
    ({infer ComparisonExpr.left=current} negated?=('!' | 'not')? op=CompareOp right=ShiftExpr)*;

ShiftExpr infers Expr:
    UnionDiffExpr ({infer ShiftExpr.left=current} op=('<<' | '>>' | '>>>') right=UnionDiffExpr)*;

UnionDiffExpr infers Expr:
    MulExpr ({infer UnionDiffExpr.left=current} op=('+' | '-' | INT_ADD_SUB) right=MulExpr)*;

MulExpr infers Expr:
    CardinalityExpr ({infer MulExpr.left=current} op=INT_MUL_DIV_REM right=CardinalityExpr)*;

CardinalityExpr infers Expr:
    {infer CardinalityExpr} op=('#' | 'sum' | 'int') expr=CardinalityExpr
    | OverrideExpr;

OverrideExpr infers Expr:
    IntersectionExpr ({infer OverrideExpr.left=current} '++' right=IntersectionExpr)*;

IntersectionExpr infers Expr:
    ArrowExpr ({infer IntersectionExpr.left=current} '&' right=ArrowExpr)*;

// Right associative: "A -> one B -> C" is "A -> one (B -> C)".
ArrowExpr infers Expr:
    DomainRestrictionExpr ({infer ArrowExpr.left=current} op=ArrowOp right=ArrowExpr)?;

DomainRestrictionExpr infers Expr:
    RangeRestrictionExpr ({infer RestrictionExpr.left=current} op='<:' right=RangeRestrictionExpr)*;

RangeRestrictionExpr infers Expr:
    JoinExpr ({infer RestrictionExpr.left=current} op=':>' right=JoinExpr)*;

// Dot join and box join share one left-associative level: "a.b[c]" is "(a.b)[c]".
// "a.*b" is a dot join with "*b", as in Alloy.
JoinExpr infers Expr:
    PrimeExpr (
        {infer DotJoinExpr.left=current} ('.' | '::') right=PrimeExpr
        | {infer BoxJoinExpr.left=current} '[' (indices+=Expr (',' indices+=Expr)*)? ']'
    )*;

PrimeExpr infers Expr:
    UnaryExpr ({infer PrimeExpr.expr=current} PRIME)*;

UnaryExpr infers Expr:
    {infer UnaryExpr} op=('~' | '^' | '*') expr=UnaryExpr
    | PrimaryExpr;

PrimaryExpr infers Expr:
    Const
    | QualName
    | {infer AtExpr} '@' ref=[NamedElement:ID]
    | {infer ThisExpr} 'this'
    | {infer ParenExpr} '(' expr=Expr ')'
    | Block
    | {infer SetExpr} '{' decls+=BoundDecl (',' decls+=BoundDecl)* blockOrBar=BlockOrBar? '}'
    | {infer LetExpr} 'let' decls+=LetDecl (',' decls+=LetDecl)* blockOrBar=BlockOrBar
    | {infer QuantExpr} quant=QUANT decls+=Decl (',' decls+=Decl)* blockOrBar=BlockOrBar
    | {infer MetaExpr} qualName=QualName '$'
    | {infer BuiltinExpr} name=(INT_CONST | TOTAL_ORDER)
    | {infer StringLiteral} value=STRING;


QualName:
    (thisModule?='this' '/')? (names+=NameOrKeyword '/')* ref=[NamedElement:IDOrBuiltin];

ModulePath:
    (names+=NameOrKeyword '/')* name=ID;

// Keywords that may appear as namespace prefixes in qualified names (e.g. seq/Int)
NameOrKeyword returns string:
    ID | 'seq' | 'Int' | 'int' | 'none' | 'univ' | 'iden';

// The final segment of a QualName can be an ID or a built-in name.
IDOrBuiltin returns string:
    ID | 'Int' | 'int' | 'none' | 'univ' | 'iden' | 'String' | 'steps' | 'disj' | 'sum';

Const:
    number=(INT | HEX_INT | BIN_INT);

ArrowOp:
    leftMult=LONE_ARROW (rightMult=MULT | rightSet='set')?
  | leftMult=SOME_ARROW (rightMult=MULT | rightSet='set')?
  | leftMult=ONE_ARROW (rightMult=MULT | rightSet='set')?
  | leftSet=SET_ARROW (rightMult=MULT | rightSet='set')?
  | '->' (rightMult=MULT | rightSet='set')?;

LetDecl:
    name=ID '=' expr=Expr;

Block:
    '{' statements+=BlockStatement* '}';

BlockStatement:
    expr=Expr;

BlockOrBar:
    block=Block | '|' expr=Expr;

CompareOp returns string:
    'in' | '=' | '<' | '>' | '=<' | '<=' | '>=';

QUANT returns string: 'all' | 'no' | 'sum' | 'some' | 'lone' | 'one';

MULT returns string: 'lone' | 'some' | 'one';

hidden terminal WS: /\s+/;
terminal PRIME: /['\u2018\u2019]/;
terminal LONE_ARROW: /lone\s*->/;
terminal SOME_ARROW: /some\s*->/;
terminal ONE_ARROW: /one\s*->/;
terminal SET_ARROW: /set\s*->/;
// fun/add etc. are single tokens in Alloy (see CompFilter.java)
terminal INT_ADD_SUB: /fun\/(add|sub)\b/;
terminal INT_MUL_DIV_REM: /fun\/(mul|div|rem)\b/;
terminal INT_CONST: /fun\/(min|max|next)\b/;
terminal TOTAL_ORDER: /pred\/totalOrder\b/;
// A command label "l:" is one token, as in CompFilter.java; otherwise "for 3 l: run p" reads "3 l" as a type scope
terminal CMD_LABEL: /[a-zA-Z_\u00C0-\u1FFF\u2C00-\uD7FF][\w"\u00C0-\u1FFF\u2C00-\uD7FF]*\s*:(?=\s*(run|check)\b)/;
// Letters include non-ASCII ranges, skipping General Punctuation (U+2000-206F) where the typographic primes live
terminal ID: /[a-zA-Z_\u00C0-\u1FFF\u2C00-\uD7FF][\w"\u00C0-\u1FFF\u2C00-\uD7FF]*/;
terminal HEX_INT returns number: /0x[0-9A-Fa-f_]+/;
terminal BIN_INT returns number: /0b[01_]+/;
terminal INT returns number: /[0-9][0-9_]*/;
terminal STRING: /"([^"\\\r\n]|\\.)*"/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT_SLASH: /\/\/[^\n\r]*/;
hidden terminal SL_COMMENT_DASH: /--[^\n\r]*/;

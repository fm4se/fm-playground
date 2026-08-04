grammar Alloy

type NamedElement = SigDecl | AdditionalSig | PredDecl | FunDecl | FactDecl | AssertDecl | FieldDecl | LetDecl | Decl | EnumDecl | MacroDecl | ModuleParam

entry AlloyModule:
    ModuleDecl? import+=Import* paragraph+=Paragraph*;

ModuleDecl:
    'module' qualName=ModulePath ('[' params+=ModuleParam (',' params+=ModuleParam)* ']')?; 

ModuleParam:
    exactly?='exactly'? name=ID;

Import:
    'open' qualName=ModulePath ('[' aliases+=ModulePath (',' aliases+=ModulePath)*']')? ('as' alias=ID)?;

Paragraph:
    SigDecl | FactDecl | PredDecl | FunDecl | AssertDecl | CmdDecl | EnumDecl | MacroDecl;

MacroDecl:
    'let' name=ID ('[' params+=ID (',' params+=ID)* ']')? '='? expr=Expr;

SigDecl:
    'private'? 'var'? 'abstract'? mult=MULT? 'sig' name=ID (',' additionalSigs+=AdditionalSig)* sigExt=SigExt? 
    '{' (fields+=FieldDecl (',' fields+=FieldDecl)* ','?)? '}' block=Block?;

AdditionalSig:
    name=ID;
    
SigExt:
    keyword=('extends' | 'in') parent=QualName ('+' additionalParents+=QualName)*;

FieldDecl:
    'var'? decl=Decl;

Decl:
    'disj'? name=QualDeclName (',' additionalNames+=QualDeclName)* ':' 'disj'? expr=Expr;

FactDecl:
    'fact' name=ID? block=Block;

PredDecl:
    'pred' (qualifier=QualName '.')? name=ID paraDecls=ParaDecls? block=Block;

FunDecl:
    'fun' (qualifier=QualName '.')? name=ID paraDecls=ParaDecls? ':' 
    (mult=MULT | multSet='set')? retType=ReturnTypeExpr '{' body=Expr '}';

ParaDecls:
    '(' (decls+=Decl (',' decls+=Decl)*)? ')' | '[' (decls+=Decl (',' decls+=Decl)*)? ']';

AssertDecl:
    'assert' name=ID? block=Block;

EnumDecl:
    'private'? 'enum' name=ID '{' values+=ID (',' values+=ID)* '}';

CmdDecl:
    (name=ID ':')? (kind='run' | kind='check') (predicate=QualName | block=Block) scope=Scope? 
    ('expect' expectNum=INT)? ('=>' chainedCmd=CmdDecl)?;

Scope:
    'for' number=INT ('but' typeScopes+=TypeScope (',' typeScopes+=TypeScope)*)? 
    | 'for' typeScopes+=TypeScope (',' typeScopes+=TypeScope)*;

TypeScope:
    'exactly'? number=INT ('..' (endNumber=INT (':' stepNumber=INT)?)?)? (type=QualName | builtin=('int' | 'Int'));


Expr:
    SequenceExpr;

// Return type expression - used in FunDecl to avoid ambiguity with multiplicity keywords
// This skips UnaryMultExpr since mult keywords (lone, some, one, set) are handled separately
ReturnTypeExpr infers Expr:
    ComparisonExpr;

SequenceExpr infers Expr:
    DisjunctionExpr ({infer SequenceExpr.left=current} ';' right=DisjunctionExpr)*;

DisjunctionExpr infers Expr:
    BiImplicationExpr ({infer DisjunctionExpr.left=current} ('||' | 'or') right=BiImplicationExpr)*;

BiImplicationExpr infers Expr:
    ImplicationExpr ({infer BiImplicationExpr.left=current} ('<=>' | 'iff') right=ImplicationExpr)*;

ImplicationExpr infers Expr:
    QuantExpr ({infer ImplicationExpr.left=current} ('=>' | 'implies') right=QuantExpr ('else' elseExpr=QuantExpr)?)?;

QuantExpr infers Expr:
    ({infer QuantExpr} QUANT decls+=Decl (',' decls+=Decl)* blockOrBar=BlockOrBar)
    | BinaryTemporalExpr;

BinaryTemporalExpr infers Expr:
    ConjunctionExpr ({infer BinaryTemporalExpr.left=current} ('until' | 'releases' | 'since' | 'triggered') right=ConjunctionExpr)*;

ConjunctionExpr infers Expr:
    UnaryLogicalExpr ({infer ConjunctionExpr.left=current} ('&&' | 'and') right=UnaryLogicalExpr)*;

UnaryLogicalExpr infers Expr:
    ({infer UnaryLogicalExpr} ('!' | 'not' | 'always' | 'eventually' | 'after' | 'before' | 'historically' | 'once') expr=UnaryLogicalExpr)
    | UnaryMultExpr;

UnaryMultExpr infers Expr:
    ({infer UnaryMultExpr} ('no' | 'lone' | 'one' | 'some' | 'set') expr=UnaryMultExpr)
    | ComparisonExpr;

ComparisonExpr infers Expr:
    UnionDiffExpr ({infer ComparisonExpr.left=current} (negated=('!' | 'not'))? op=CompareOp right=UnionDiffExpr)?;

UnionDiffExpr infers Expr:
    CardinalityExpr ({infer UnionDiffExpr.left=current} ('+' | '-') right=CardinalityExpr)*;

CardinalityExpr infers Expr:
    ({infer CardinalityExpr} '#' expr=CardinalityExpr)
    | OverrideExpr;

OverrideExpr infers Expr:
    IntersectionExpr ({infer OverrideExpr.left=current} '++' right=IntersectionExpr)*;

IntersectionExpr infers Expr:
    ArrowExpr ({infer IntersectionExpr.left=current} '&' right=ArrowExpr)*;

ArrowExpr infers Expr:
    RestrictionExpr ({infer ArrowExpr.left=current} arrows+=ArrowOp right=RestrictionExpr)*;

RestrictionExpr infers Expr:
    DotJoinExpr ({infer RestrictionExpr.left=current} ('<:' | ':>') right=DotJoinExpr)*;

DotJoinExpr infers Expr:
    BoxJoinExpr ({infer DotJoinExpr.left=current} ('.' | '.*' | '.^' | '.~') right=BoxJoinExpr)*;

BoxJoinExpr infers Expr:
    PrimitiveExpr (
        {infer BoxJoinExpr.left=current} '[' indices+=Expr (',' indices+=Expr)* ']'
    )*;

PrimitiveExpr infers Expr:
    PrimeExpr;

PrimeExpr infers Expr:
    UnaryExpr ({infer PrimeExpr.left=current} PRIME)*;

UnaryExpr infers Expr:
    ({infer UnaryExpr} ('~' | '^' | '*') expr=UnaryExpr)
    | PrimaryExpr;

PrimaryExpr infers Expr:
    Const 
    | QualName 
    | ({infer AtExpr} '@' ref=[NamedElement:ID])
    | ({infer ThisExpr} 'this')
    | ({infer ParenExpr} '(' expr=Expr ')')
    | Block
    | ({infer SetExpr} '{' decls+=Decl (',' decls+=Decl)* blockOrBar=BlockOrBar '}')
    | ({infer SumExpr} 'sum' decls+=Decl (',' decls+=Decl)* '|' expr=Expr)  
    | ({infer LetExpr} 'let' decls+=LetDecl (',' decls+=LetDecl)* blockOrBar=BlockOrBar)  
    | ({infer MetaExpr} qualName=QualName '$')  
    | STRING  
    ;


QualName:
    ('this/')? (names+=ID'/')* ID=[NamedElement:ID];

QualDeclName:
    ('this/')? (names+=ID'/')* name=ID;

ModulePath:
    ('this/')? (names+=ID'/')* name=ID;

Const:
    '-'? number=(INT | HEX_INT | BIN_INT) | 'none' | 'univ' | 'iden' | 'Int' | 'String' | 'int';

ArrowOp:
    (leftMult=('lone' | 'one') | leftSet='set')? '->' (rightMult=MULT | rightSet='set')?;

LetDecl:
    name=ID '=' expr=Expr;

Block:
    '{' statements+=BlockStatement* '}';

BlockStatement:
    expr=Expr ';'?;

BlockOrBar:
    block=Block | '|' expr=Expr;

CompareOp returns string:
    'in' | '=' | '<' | '>' | '=<' | '>=';

QUANT returns string: 'all' | 'no' | 'sum' | 'some' | 'lone' | 'one';

MULT returns string: 'lone' | 'some' | 'one';

terminal PRIME: "'";
hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_\"]*/;
terminal INT: /\d+/;
terminal HEX_INT: /0x[0-9A-Fa-f]+/;
terminal BIN_INT: /0b[01]+/;
terminal STRING: /"([^"\\]|\\.)*"/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT_SLASH: /\/\/[^\n\r]*/;
hidden terminal SL_COMMENT_DASH: /--[^\n\r]*/;


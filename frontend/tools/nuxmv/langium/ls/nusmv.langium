grammar NuSMV

interface Expression {}

hidden terminal WS: /\s+/;
hidden terminal SL_COMMENT: /--[^\n\r]*/;

terminal WORD: /0(?:u|s)?(?:b|B|o|O|_|d|D|h|H)\d*_[A-Fa-f0-9]+/;
terminal ID: /[A-Za-z_][A-Za-z0-9_$#-]*/;
terminal INT returns number: /[0-9]+/;

entry NuSmvModel:
    modules+=Module*;

Module:
    'MODULE' name=ID ('(' params+=FormalParameter (',' params+=FormalParameter)* ')')?
    elements+=ModuleElement*;

FormalParameter:
    name=ID;

ModuleElement:
    VariableDeclaration | IVariableDeclaration | FrozenVariableDeclaration |
    DefineDeclaration | ConstantsDeclaration | AssignConstraint | TransConstraint |
    InitConstraint | InvarConstraint | FairnessExpression | JusticeExpression |
    CompassionExpression | CtlSpecification | PslSpecification |
    InvarSpecification | LtlSpecification | IsaDeclaration | ComputeSpecification;

VariableDeclaration:
    'VAR' vars+=VarBody*;

IVariableDeclaration:
    'IVAR' vars+=VarBody+;

FrozenVariableDeclaration:
    'FROZENVAR' vars+=VarBody+;

VarBody:
    name=ID ':' type=Type semicolon?=';'?;

DefineDeclaration:
    'DEFINE' defineBodies+=DefineBody*;

DefineBody:
    name=ID ':=' assignment=Expression semicolon?=';'?;

ConstantsDeclaration:
    'CONSTANTS' constants+=ConstantSymbol (',' constants+=ConstantSymbol)* semicolon?=';'?;

ConstantSymbol:
    name=ID;

AssignConstraint:
    'ASSIGN' bodies+=AssignBody*;

AssignBody:
    VarBodyAssign | InitBody | NextBody;

VarBodyAssign:
    var=VariablePath ':=' assignment=Expression semicolon?=';'?;

InitBody:
    'init' '(' var=VariablePath ')' ':=' initial=Expression semicolon?=';'?;

NextBody:
    'next' '(' var=VariablePath ')' ':=' next=Expression semicolon?=';'?;

TransConstraint:
    'TRANS' expression=Expression semicolon?=';'?;

InitConstraint:
    'INIT' expression=Expression semicolon?=';'?;

InvarConstraint:
    'INVAR' expression=Expression semicolon?=';'?;

FairnessExpression:
    'FAIRNESS' expression=Expression semicolon?=';'?;

JusticeExpression:
    'JUSTICE' expression=Expression semicolon?=';'?;

CompassionExpression:
    'COMPASSION' '(' first=Expression ',' second=Expression ')' semicolon?=';'?;

CtlSpecification:
    kind=('CTLSPEC' | 'SPEC') (nameKeyword?='NAME' name=ID ':=')? expression=Expression semicolon?=';'?;

PslSpecification:
    'PSLSPEC' (nameKeyword?='NAME' name=ID ':=')? expression=Expression semicolon?=';'?;

InvarSpecification:
    'INVARSPEC' (name=ID ':=')? expression=Expression semicolon?=';'?;

IsaDeclaration:
    'ISA' id=ID;

LtlSpecification:
    'LTLSPEC' (nameKeyword?='NAME' name=ID ':=')? expression=Expression semicolon?=';'?;

ComputeSpecification:
    'COMPUTE' minMax=('MIN' | 'MAX') '[' first=RTCTLExpression ',' second=RTCTLExpression ']' semicolon?=';'?;

RTCTLExpression:
    SingleRTCTLExpression | UnaryRTCTLExpression;

SingleRTCTLExpression:
    expression=Expression;

UnaryRTCTLExpression:
    operator=('EBF' | 'ABF' | 'EBG' | 'ABG') range=RangeExpression expression=RTCTLExpression;

RangeExpression:
    lower=NUMBER '..' upper=NUMBER;

Type:
    BooleanType | WordType | UnsignedWordType | SignedWordType |
    EnumType | IntervalType | ArrayType | AsyncProcessType | SyncProcessType;

BooleanType:
    {infer BooleanType} 'boolean';

WordType:
    'word' '[' width=NUMBER ']';

UnsignedWordType:
    'unsigned' 'word' '[' width=NUMBER ']';

SignedWordType:
    'signed' 'word' '[' width=NUMBER ']';

EnumType:
    '{' values+=EnumValue (',' values+=EnumValue)* '}';

EnumValue:
    name=ID;

IntervalType:
    lower=NumberOrPath '..' upper=NumberOrPath;

ArrayType:
    'array' lower=NumberOrPath '..' upper=NumberOrPath 'of' type=Type;

AsyncProcessType:
    'process' module=[Module:ID] ('(' params+=Expression (',' params+=Expression)* ')')?;

SyncProcessType:
    module=[Module:ID] ('(' params+=Expression (',' params+=Expression)* ')')?;

Expression returns Expression:
    ImpliesExpression;

ImpliesExpression returns Expression:
    IffExpression ({infer BinaryExpression.left=current} operator='->' right=IffExpression)?;

IffExpression returns Expression:
    LtlBinaryExpression ({infer BinaryExpression.left=current} operator='<->' right=LtlBinaryExpression)*;

LtlBinaryExpression returns Expression:
    OrExpression ({infer BinaryExpression.left=current} operator=('U' | 'V' | 'S' | 'T') right=OrExpression)*;

OrExpression returns Expression:
    AndExpression ({infer BinaryExpression.left=current} operator=('|' | 'xor' | 'xnor') right=AndExpression)*;

AndExpression returns Expression:
    TemporalExpression ({infer BinaryExpression.left=current} operator='&' right=TemporalExpression)*;

TemporalExpression returns Expression:
    {infer UnaryExpression} operator=('EG' | 'EX' | 'EF' | 'AG' | 'AX' | 'AF' | 'X' | 'G' | 'F' | 'Y' | 'Z' | 'H' | 'O') operand=TemporalExpression
    | ComparisonExpression;

ComparisonExpression returns Expression:
    InExpression ({infer BinaryExpression.left=current} operator=('=' | '!=' | '<' | '>' | '<=' | '>=') right=InExpression)*;

InExpression returns Expression:
    UnionExpression ({infer BinaryExpression.left=current} operator='in' right=UnionExpression)*;

UnionExpression returns Expression:
    ShiftExpression ({infer BinaryExpression.left=current} operator='union' right=ShiftExpression)*;

ShiftExpression returns Expression:
    AdditiveExpression ({infer BinaryExpression.left=current} operator=('>>' | '<<') right=AdditiveExpression)*;

AdditiveExpression returns Expression:
    MultiplicativeExpression ({infer BinaryExpression.left=current} operator=('+' | '-') right=MultiplicativeExpression)*;

MultiplicativeExpression returns Expression:
    PrefixExpression ({infer BinaryExpression.left=current} operator=('*' | '/' | 'mod' | '::') right=PrefixExpression)*;

PrefixExpression returns Expression:
    {infer UnaryExpression} operator=('!' | '-' | '+') operand=TemporalExpression
    | PrimaryExpression;

PrimaryExpression:
    GroupedExpression | NextCallExpression | CaseExpression | SetExpression |
    WordLiteral | IntervalLiteral | UntilCtlExpression | FunctionCallExpression |
    ReferenceExpression | LiteralExpression;

GroupedExpression:
    '(' expression=Expression ')';

NextCallExpression:
    'next' '(' expression=Expression ')';

CaseExpression:
    'case' branches+=CaseBranch+ 'esac';

CaseBranch:
    condition=Expression ':' value=Expression ';';

SetExpression:
    '{' elements+=Expression (',' elements+=Expression)* '}';

WordLiteral:
    value=WORD;

IntervalLiteral:
    lower=NUMBER '..' upper=NUMBER;

UntilCtlExpression:
    quantifier=('E' | 'A') '[' expression=Expression ']';

FunctionCallExpression:
    function=('word1' | 'bool' | 'toint') '(' argument=Expression ')';

ReferenceExpression:
    path=VariablePath;

LiteralExpression:
    value=('TRUE' | 'FALSE' | 'self') | number=NUMBER;

VariablePath:
    head=ID segments+=PathSegment*;

PathSegment:
    DotSegment | IndexSegment | SliceSegment;

DotSegment:
    '.' symbol=ID;

IndexSegment:
    '[' index=NumberOrPath ']';

SliceSegment:
    '[' start=NUMBER ':' end=NUMBER ']';

NumberOrPath:
    value=NUMBER | path=VariablePath;

NUMBER returns string:
    '-'? INT;

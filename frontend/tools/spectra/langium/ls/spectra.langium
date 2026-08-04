grammar Spectra

entry Model infers Model:
    (imports+=Import )* ('module' | 'spec' )name=ID  (elements+=Decl )+
;

Import infers Import:
    'import' importURI=STRING
;

Decl infers Decl:
    Var | TypeDef | Define | Predicate | Pattern | Monitor | WeightDef | LTLGar | LTLAsm | EXGar | Counter | DefineRegExp | RegexpTest
;

WeightDef infers WeightDef:
    'weight' (name=ID  ':' )? negative='-'? value=INT  definition=TemporalInExpr  TOK_SEMI
;

type VarOwner = 'output' | 'out' | 'sysvar' | 'sys' | 'input' | 'in' | 'envvar' | 'env' | 'auxvar' | 'aux';
VarOwner returns VarOwner:
    'output' | 'out' | 'sysvar' | 'sys' | 'input' | 'in' | 'envvar' | 'env' | 'auxvar' | 'aux'
;
// VarOwner_SYS returns string: 'output' | 'out' | 'sysvar' | 'sys' ;
// VarOwner_ENV returns string: 'input' | 'in' | 'envvar' | 'env' ;
// VarOwner_AUX returns string: 'auxvar' | 'aux' ;

Var infers Var:
    kind=VarOwner  ^type=VarType  name=ID  TOK_SEMI
;

TypeDef infers TypeDef:
    'type' name=ID  '=' ^type=VarType  TOK_SEMI
;

VarDecl infers VarDecl:
    ^type=VarType  name=ID  TOK_SEMI
;

Referrable infers Referrable:
    Var | TypeConstant | DefineDecl | TypedParam 
    | PatternParam | Monitor | Counter 
    | DefineRegExpDecl | DomainVarDecl
    | TypedParamList | VarDecl
;

TypeConstant infers TypeConstant:
    name=TypeConstantLiteral
;

TypeConstantLiteral returns string:
    ID | INT
;

Define infers Define:
    'define' (defineList+=DefineDecl )+
;

DefineDecl infers DefineDecl:
    ((name=ID  ':=' simpleExpr=TemporalExpression  ) | (name=ID  ('[' dimensions+=SizeDefineDecl  ']' )+ ':=' innerArray=DefineArray  ) )TOK_SEMI
;

DefineArray infers DefineArray:
    '{' (simpleExprs+=TemporalExpression  (',' simpleExprs+=TemporalExpression  )* ) '}'  | '{' (innerArrays+=DefineArray  (',' innerArrays+=DefineArray  )* ) '}'
;

DefineRegExp infers DefineRegExp:
    'regexp' (defineRegsList+=DefineRegExpDecl )+
;

DefineRegExpDecl infers DefineRegExpDecl:
    name=ID  ':=' exp=RegExp  TOK_SEMI
;

PatternParamList infers PatternParamList:
    params+=PatternParam  (',' params+=PatternParam  )*
;

PatternParam infers PatternParam:
    name=ID
;

TypedParamList infers TypedParamList:
    params+=TypedParam  (',' params+=TypedParam  )*
;

TypedParam infers TypedParam:
    ^type=VarType  name=ID
;

type OverflowMethod = 'keep' | 'false' | 'modulo';
OverflowMethod returns OverflowMethod:
    OverflowMethod_KEEP | OverflowMethod_FALSE | OverflowMethod_MODULO
;
OverflowMethod_KEEP returns string:
    'keep';
OverflowMethod_FALSE returns string:
    'false';
OverflowMethod_MODULO returns string:
    'modulo';

Counter infers Counter:
    'counter' name=ID  ('(' range=Subrange  ')' ) '{' (((initial+=TemporalInExpr ) | ('reset:' resetPred+=TemporalInExpr  ) | ('inc:' incPred+=TemporalExpression  ) | ('dec:' decPred+=TemporalExpression  ) | ('overflow:' overflowMethod+=OverflowMethod  ) | ('underflow:' underflowMethod+=OverflowMethod  ) )TOK_SEMI )* '}'
;

Monitor infers Monitor:
    'monitor' ^type=VarType  name=ID  '{' (((('ini' | 'initially' )?initial+=TemporalInExpr  ) | (('G' | 'trans' )safety+=TemporalInExpr  ) | (('always' | 'alw' )stateInv+=TemporalInExpr  ) )TOK_SEMI )* '}'
;

Pattern infers Pattern:
    'pattern' name=ID  ('(' params=PatternParamList  ')' )? ('{' ('var' varDeclList+=VarDecl  )* (((('ini' | 'initially' )?initial+=TemporalInExpr  ) | (('G' | 'trans' )safety+=TemporalInExpr  ) | (('always' | 'alw' )stateInv+=TemporalInExpr  ) | (('GF' | 'alwEv' | 'alwaysEventually' )justice+=TemporalInExpr  ) )TOK_SEMI )+ '}' )
;

Predicate infers Predicate:
    'predicate' name=ID  ('(' params=TypedParamList  ')'  | '()' )((':' body=TemporalExpression  TOK_SEMI ) | ('{' body=TemporalExpression  '}' ) )
;

VarType infers VarType:
    (name='boolean'  | 'Int' '(' subr=Subrange  ')'  | '{' const+=TypeConstant  (',' const+=TypeConstant  )* '}'  | ^type=[TypeDef:ID] )('[' dimensions+=SizeDefineDecl  ']' )*
;

LTLGar infers LTLGar:
    ('guarantee' | 'gar' )(name=ID  ('{' params=TypedParamList  '}' )? ':' )? ((('ini' | 'initially' | safety=('G' | 'trans' ) | stateInv=('always' | 'alw' ) | justice=('GF' | 'alwEv' | 'alwaysEventually' ) )?(temporalExpr=QuantifierExpr ) ) | (trig=Trigger ) )TOK_SEMI
;

LTLAsm infers LTLAsm:
    ('assumption' | 'asm' )(name=ID  ('{' params=TypedParamList  '}' )? ':' )? ((('ini' | 'initially' | safety=('G' | 'trans' ) | stateInv=('always' | 'alw' ) | justice=('GF' | 'alwEv' | 'alwaysEventually' ) )?(temporalExpr=QuantifierExpr ) ) | (trig=Trigger ) )TOK_SEMI
;

EXGar infers EXGar:
    ('guarantee' | 'gar' )(name=ID  ':' )? (('GE' elements+=TemporalInExpr  (',' elements+=TemporalInExpr  )* ) | ('GEF' regExpPointer=[DefineRegExpDecl:ID] ) | ('GEF' regExp=RegExp  ) )TOK_SEMI
;

RegexpTest infers RegexpTest:
    'regtest' (name=ID  ':' )? ((regExpPointer=[DefineRegExpDecl:ID]) | (regExp=RegExp ) )TOK_SEMI
;

TemporalExpression infers TemporalExpression:
    QuantifierExpr
;

TemporalInExpr infers TemporalExpression:
    TemporalImpExpr ({infer TemporalInExpr.left=current} (not?='not' )? operator='in'  '{' values+=ValueInRange  (',' values+=ValueInRange  )* '}' )?
;

TemporalImpExpr infers TemporalExpression:
    TemporalIffExpr ({infer TemporalImpExpr.left=current} operator=('->' | 'implies' ) implication=TemporalImpExpr  )?
;

TemporalIffExpr infers TemporalExpression:
    TemporalOrExpr ({infer TemporalIffExpr.elements+=current} operator=('<->' | 'iff' ) elements+=TemporalOrExpr  )*
;

TemporalOrExpr infers TemporalExpression:
    TemporalAndExpr ({infer TemporalOrExpr.elements+=current} operator+=('|' | 'or' | 'xor' ) elements+=TemporalAndExpr  )*
;

TemporalAndExpr infers TemporalExpression:
    TemporalRelationalExpr ({infer TemporalAndExpr.elements+=current} operator+=('&' | 'and' ) elements+=TemporalRelationalExpr  )*
;

TemporalRelationalExpr infers TemporalExpression:
    TemporalRemainderExpr ({infer TemporalRelationalExpr.left=current} operator=('=' | '!=' | '<' | '>' | '<=' | '>=' ) right=TemporalRemainderExpr  )?
;

TemporalRemainderExpr infers TemporalExpression:
    TemporalAdditiveExpr ({infer TemporalRemainderExpr.left=current} operator=('mod' | '%' ) right=TemporalAdditiveExpr  )?
;

TemporalAdditiveExpr infers TemporalExpression:
    TemporalMultiplicativeExpr ({infer TemporalAdditiveExpr.elements+=current} operator+=('+' | '-' ) elements+=TemporalMultiplicativeExpr  )*
;

TemporalMultiplicativeExpr infers TemporalExpression:
    TemporalBinaryExpr ({infer TemporalMultiplicativeExpr.elements+=current} operator+=('*' | '/' ) elements+=TemporalBinaryExpr  )*
;

TemporalBinaryExpr infers TemporalExpression:
    TemporalUnaryExpr ({infer TemporalBinaryExpr.elements+=current} operator+=('S' | 'SINCE' | 'T' | 'TRIGGERED' ) elements+=TemporalUnaryExpr  )*
;

TemporalUnaryExpr infers TemporalExpression:
    TemporalPrimaryExpr | {infer TemporalUnaryExpr} (kinds=('Y' | 'PREV' ) tue=TemporalUnaryExpr   | kinds=('H' | 'HISTORICALLY' ) tue=TemporalUnaryExpr   | kinds=('O' | 'ONCE' ) tue=TemporalUnaryExpr   )
;

TemporalPrimaryExpr infers TemporalExpression:
    Constant | '(' QuantifierExpr ')'  | {infer TemporalPrimaryExpr} ((predPatt=[PredicateOrPatternReferrable:ID])  ('(' predPattParams+=TemporalInExpr  (',' predPattParams+=TemporalInExpr  )* ')'  | '()' ) | operator=('-' | '!' ) tpe=TemporalPrimaryExpr   | pointer=[Referrable:ID] ('[' index+=TemporalInExpr  ']' )*  | operator='next'  '(' temporalExpression=TemporalInExpr  ')'  | operator='regexp'  '(' (regexp=RegExp  | regexpPointer=[DefineRegExpDecl:ID] )')'  | pointer=[Referrable:ID] operator='.all'   | pointer=[Referrable:ID] operator='.any'   | pointer=[Referrable:ID] operator='.prod'   | pointer=[Referrable:ID] operator='.sum'   | pointer=[Referrable:ID] operator='.min'   | pointer=[Referrable:ID] operator='.max'   )
;

PredicateOrPatternReferrable infers PredicateOrPatternReferrable:
    Pattern | Predicate
;

Subrange infers Subrange:
    from=SizeDefineDecl  '..' to=SizeDefineDecl
;

Constant infers TemporalExpression:
    {infer Constant} (booleanValue='FALSE'  | booleanValue='false'  | booleanValue='TRUE'  | booleanValue='true'  | integerValue=INT  )
;

Trigger infers Trigger:
    {infer Trigger} 'trig' (initPointer=[DefineRegExpDecl:ID] | initRegExp=RegExp  )'|=>' (effectPointer=[DefineRegExpDecl:ID] | effectRegExp=RegExp  )
;

RegExp infers RegExpr:
    BinaryRegExp
;

BinaryRegExp infers RegExpr:
    UnaryRegExp ({infer BinaryRegExp.left=current} (op=('&' | '|' ))? right=UnaryRegExp  )*
;

UnaryRegExp infers RegExpr:
    CompRegExp ({infer UnaryRegExp.left=current} ((kleened?='*' ) | (questionMark?='?' ) | (plus?='+' ) | (haveExactRepetition?='{'  exactRepetition=INT  '}' ) | (haveAtLeast?='{'  atLeast=INT  ',' '}' ) | (haveRange?='{'  (from=INT  | fromDefine=[DefineDecl:ID] )',' (to=INT  | toDefine=[DefineDecl:ID] )'}' ) ))?
;

CompRegExp infers RegExpr:
    PrimaryRegExp | ({infer CompRegExp} (comp='~' ) left=CompRegExp  )
;

PrimaryRegExp infers RegExpr:
    '(' RegExp ')'  | val=('TRUE' | 'FALSE' | 'true' | 'false' ) | assrt=BooleanTerm  | empty?='()'
;

BooleanTerm infers BooleanTerm:
    {infer BooleanTerm} '[' relExpr=TemporalInExpr  ']'
;

ValueInRange infers ValueInRange:
    const=[TypeConstant:ID] | int=INT  | (from=INT  multi?='-'  to=INT  ) | booleanValue=('TRUE' | 'FALSE' | 'true' | 'false' )
;

QuantifierExpr infers TemporalExpression:
    TemporalInExpr | {infer QuantifierExpr} (operator=('forall' | 'exists' ) domainVar=DomainVarDecl  '.' temporalExpr=QuantifierExpr  )
;

DomainVarDecl infers DomainVarDecl:
    name=ID  'in' domainType=VarType
;

SizeDefineDecl infers SizeDefineDecl:
    value=INT  | sizeDef=[DefineDecl:ID] | '(' arithExp=TemporalExpression  ')'
;

TOK_SEMI returns string:
    ';'
;

//terminal SL_COMMENT returns string:('//' | '--' ) !('\n' | '\r' )('\r'? '\n' )?  ;


terminal ID returns string:'^'? ('a' ..'z' | 'A' ..'Z' | '_' )('a' ..'z' | 'A' ..'Z' | '_' | '0' ..'9' )*;
terminal INT returns number:'0' ..'9'+;
terminal STRING returns string:'"' ('\\' ('"' | '\\' | 'n' | 'r' | 't') | !('\\' | '"'))* '"';
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*|--[^\n\r]*/;
hidden terminal WS returns string:(' ' | '\t' | '\r' | '\n' )+;
// terminal ANY_OTHER returns string:.;

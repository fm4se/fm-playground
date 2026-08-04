grammar Limboole

entry Expr infers Expr:
    Iff 
;

Iff infers Expr:
    Implies ({ infer Iff.left=current} '<->' right=Implies  )*  
;

Implies infers Expr:
    Or (('->' | '<-' ){ infer Implies.left=current} right=Or  )?  
;

Or infers Expr:
    And ({ infer Or.left=current} '|' right=And  )*  
;

And infers Expr:
    Not ({ infer And.left=current} '&' right=Not  )*  
;

Not infers Expr:
    Basic | '!' Not  
;

Basic infers Expr:
    var=VAR  | '(' Expr ')'  
;

terminal VAR returns string: /([a-zA-Z0-9_\-\.\[\]\$\@]*[a-zA-Z0-9_\.\[\]\$\@])/;

hidden terminal SL_COMMENT returns string: /%[^\n\r]*/;

hidden terminal WS returns string: /\s+/;


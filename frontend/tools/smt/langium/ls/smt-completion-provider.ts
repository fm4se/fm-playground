import { MaybePromise} from "langium";
import { CompletionAcceptor, DefaultCompletionProvider, NextFeature, CompletionContext} from "langium/lsp";




export class SmtCompletionProvider extends DefaultCompletionProvider {

  
    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
        
      super.completionFor(context, next, acceptor);
    
        if(this.isTerminalCompletionCandidate(next)){
          this.completionForTerminal(context, next, acceptor);
        } else if(this.isSmtSymbolCompletionCandidate(next)){
          this.completionForSmtSymbol(context, next, acceptor); // 
        }

        // ELSE 
        // return no suggestion!

        // Don't offer any completion for other elements (i.e. terminals, datatype rules)
        // We - from a framework level - cannot reasonably assume their contents.
        // Adopters can just override `completionFor` if they want to do that anyway.
    }


    protected isSmtSymbolCompletionCandidate(next: NextFeature): boolean{
      if(next.feature.$type === 'RuleCall'){
        var feature =  (next.feature as any)
        return (feature.rule.$refText && feature.rule.$refText === 'SIMPLE_SYMBOL');
      }

      return false;
    }


  protected completionForSmtSymbol(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): void {
    acceptor(context, {
            label: '<Symbol>',
            detail: 'Symbol',
            sortText: '12'
    });
  }

    protected isTerminalCompletionCandidate(next: NextFeature): boolean {
        if(next.feature.$type === 'RuleCall'){
          var feature = (next.feature as any)
          return (feature.rule.$refText && feature.rule.$refText === 'BValue')
        }

        return false;
    }


    // Provide custom completion for targeted terminal rules.
    protected completionForTerminal(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): void {        
        if((next.feature as any).rule.$refText === 'BValue'){
          acceptor(context, {
            label: 'true',
            detail: 'Boolean',
            sortText: '12'
          });

          acceptor(context, {
            label: 'false',
            detail: 'Boolean',
            sortText: '12'
          });
        }    
  }

}

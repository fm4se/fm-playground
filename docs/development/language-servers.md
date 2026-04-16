# Language Server Integration

FM Playground supports integration of [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) based language servers to provide rich editing features like syntax highlighting, autocompletion, error diagnostics, and more. This guide covers two approaches:

1. **Langium-based Language Servers** - For creating a new domain-specific language (DSL) using the [Langium framework](https://langium.org/). It allows you to define your own language grammar, services, and tooling.
2. **External Language Servers** - For integrating existing LSP implementations
that are already available as services. This allows you to leverage existing language servers without needing to implement them from scratch.

## Overview

Language servers in FM Playground provide:

- **Syntax Highlighting**: Using TextMate grammars
- **Error Diagnostics**: Real-time syntax and semantic error reporting  
- **Auto-completion**: Context-aware code suggestions
- **Code Actions**: Quick fixes and refactoring suggestions
- **Hover Information**: Documentation and type information on hover
- **Semantic Highlighting**: Advanced syntax coloring based on language semantics
- **And more**: Depending on the language server capabilities


### Communication Patterns

1. **Browser Workers**: For Langium-based servers running in the browser
2. **WebSocket Connections**: For external language servers running as services
3. **Message Channels**: For bridging between Monaco Editor and workers/WebSockets

---

## Examples in FM Playground

### Langium-based Examples

| Language | Location | Features |
|----------|----------|----------|
| **Limboole** | `frontend/tools/limboole/langium/` | Boolean formulas, validation, code actions |
| **Spectra** | `frontend/tools/spectra/langium/` | Temporal logic, scoping, workspace management |

### External LSP Examples  

| Language | Location | Features |
|----------|----------|----------|
| **Dafny** | `dafny-lsp-proxy/` | Full Dafny language support via `dafny server`, multi-session WebSocket proxy |
| **SMT** | [feature/dolmen-lsp](https://github.com/fm4se/fm-playground/blob/feature/dolmen-lsp/frontend/tools/smt/dolmen/dolmenWebSocketClient.ts) branch | Full SMT-LIB syntax support, external solver integration |



## Continue reading:

- [**Langium Language Server Implementation →**](./langium-language-servers.md)
- [**External Language Server Integration →**](./external-language-servers.md)



## Resources

- [Langium Documentation](https://langium.org/)
- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/)
- [TextMate Grammar Guide](https://macromates.com/manual/en/language_grammars)

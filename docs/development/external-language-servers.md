# External Language Server Integration

This guide covers integrating existing Language Server Protocol (LSP) implementations into FM Playground. This approach is ideal when you have an existing language server or want to use a language server implemented in another language.

## Overview

External language servers run as separate processes and communicate with the frontend via:

- **WebSocket connections** - Most common approach
- **HTTP APIs** - For stateless interactions
- **stdin/stdout** - Via a proxy service

## When to Use External Language Servers

- You have an existing LSP implementation
- The language server is implemented in another language (Python, Rust, Java, etc.)
- You want to leverage existing tools and ecosystems
- The language server requires system resources or libraries not available in browsers


## Integration Approaches

- Direct WebSocket Connection: For language servers that natively support WebSocket connections.

- WebSocket Proxy: For language servers that use stdin/stdout, with a proxy service handling WebSocket ↔ stdio conversion.

- HTTP API Integration: For RESTful language services that don't implement full LSP.


## Real-World Example: SMT-LIB with Dolmen LSP

FM Playground includes a production example of external language server integration. The SMT-LIB language support uses Dolmen LSP, an external language server, connected via WebSocket.

[Dolmen](https://github.com/Gbury/dolmen) provides a library and a binary to parse, typecheck, and evaluate SMT-LIB scripts with other languages used in automated deduction. 

### Dolmen LSP WebSocket Proxy

The Dolmen LSP integration demonstrates a complete WebSocket proxy implementation that bridges the gap between a native LSP server (implemented in OCaml) and web-based clients. This proxy handles the protocol translation between WebSocket messages and the LSP's stdin/stdout communication.

#### Architecture Overview

The proxy consists of three main components:

1. **Docker Container**: Provides an isolated environment with OCaml, Dolmen LSP, and Python dependencies
2. **FastAPI WebSocket Server**: Handles incoming WebSocket connections from the frontend
3. **LSP Process Manager**: Manages the dolmenls subprocess and message routing

#### Docker Environment Setup

```dockerfile
FROM ocaml/opam:alpine-3.18-ocaml-5.0

# Install system dependencies including build tools and Python
RUN apk update && apk add --no-cache \
    build-base curl git python3 py3-pip nodejs npm

# Install Dolmen LSP via opam
USER opam
RUN opam init --disable-sandboxing -y
RUN opam install dolmen_lsp -y

# Install Python API dependencies
USER root
RUN pip3 install fastapi uvicorn websockets

# Setup application
WORKDIR /app
COPY main.py dolmen_lsp_proxy.py /app/
USER opam
ENV PATH="/home/opam/.opam/5.0/bin:$PATH"
EXPOSE 8003
CMD ["python3", "main.py"]
```


#### Key Features

**Process Management**
```python
async def start_dolmen_lsp(self):
    self.dolmen_process = await asyncio.create_subprocess_exec(
        'dolmenls',
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    asyncio.create_task(self.read_dolmen_output())
```

**Protocol Translation**
The proxy handles LSP message format conversion:

- **Incoming**: WebSocket JSON → LSP Content-Length format
- **Outgoing**: LSP Content-Length format → WebSocket JSON

```python
async def send_to_dolmen(self, message: Dict[str, Any]):
    message_str = json.dumps(message)
    content = f"Content-Length: {len(message_str)}\r\n\r\n{message_str}"
    self.dolmen_process.stdin.write(content.encode('utf-8'))
    await self.dolmen_process.stdin.drain()
```

**Message Broadcasting**
Supports multiple concurrent WebSocket clients:
```python
async def broadcast_to_clients(self, message: Dict[str, Any]):
    for client_id, websocket in self.clients.items():
        try:
            if hasattr(websocket, 'send_text'):
                await websocket.send_text(json.dumps(message))
            else:
                await websocket.send(json.dumps(message))
        except Exception as e:
            # Handle disconnected clients
            disconnected_clients.append(client_id)
```

### Dolmen LSP WebSocket Client

Now that we have the server-side proxy, we need a client-side implementation to connect to it from FM Playground. Upon running the docker container, the client can connect to the WebSocket server and communicate with the Dolmen LSP.

```typescript
// frontend/tools/common/dolmenWebSocketClient.ts
export class DolmenWebSocketWorker {
    private websocket: WebSocket;
    private isConnected = false;
    private pendingMessages: any[] = [];
    private connectedPort: MessagePort | null = null;
    
    constructor(url: string = 'ws://localhost:5173/dolmen-lsp') {
        this.websocket = new WebSocket(url);
        this.setupWebSocket();
    }

    private setupWebSocket() {
        this.websocket.onopen = () => {
            this.isConnected = true;
            // Send queued messages
            this.pendingMessages.forEach(msg => {
                this.websocket.send(JSON.stringify(msg));
            });
            this.pendingMessages = [];
        };

        this.websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (this.connectedPort) {
                this.connectedPort.postMessage(message);
            }
        };
    }

    postMessage(data: any, transfer?: Transferable[]) {
        if (data.port && transfer && transfer[0] === data.port) {
            this.connectedPort = data.port;
            
            data.port.onmessage = (event: MessageEvent) => {
                if (this.isConnected) {
                    this.websocket.send(JSON.stringify(event.data));
                } else {
                    this.pendingMessages.push(event.data);
                }
            };
            
            data.port.start();
        }
    }
}
```

#### Key Patterns

1. **Worker Simulation**: The class mimics a Web Worker interface while using WebSocket underneath
2. **Message Queuing**: Messages are queued when disconnected and sent when connected
3. **Port-based Communication**: Uses MessagePort for Monaco Editor compatibility
4. **Error Handling**: Graceful handling of connection issues

### 

### Integration

```typescript
// In lspWrapperConfig.ts
const dolmenWorker = createDolmenWebSocketWorker('ws://localhost:5173/dolmen-lsp');
const dolmenChannel = new MessageChannel();
dolmenWorker.postMessage({ port: dolmenChannel.port2 }, [dolmenChannel.port2]);

// Configure language client
languageClientConfigs: {
    smt: {
        languageId: 'smt',
        connection: {
            options: {
                $type: 'WorkerDirect',
                worker: dolmenWorker as any,
                messagePort: dolmenChannel.port1,
            },
            messageTransports: { reader: dolmenReader, writer: dolmenWriter },
        },
    },
}
```

For the lspWrapperConfig configuration, you can refer to the [Langium-based Language Servers](./langium-language-servers.md) guide for more details on how to set up the language client.

This example serves as a complete working reference for external language server integration. Since LSP is a standardized protocol, the same patterns can be applied to other language servers with minimal adjustments. The key is to ensure the WebSocket communication adheres to the LSP message format and that the client-side implementation can handle the specific language server's capabilities and features.


## Real-World Example: Dafny LSP

FM Playground also includes a production integration of the Dafny language server. Unlike the Dolmen/SMT example which uses OCaml, the Dafny LSP proxy uses the native `dafny server` command which natively speaks the LSP protocol via stdin/stdout.

### Architecture

The Dafny LSP integration uses a multi-session architecture where each connected user gets their own isolated `dafny server` process:

```
Browser (Monaco Editor)
    ↕ WebSocket
Dafny LSP Proxy (FastAPI)
    ↕ stdin/stdout (per session)
dafny server (one process per user)
```

### Key Differences from Dolmen

| Aspect | Dolmen (SMT) | Dafny |
|--------|-------------|-------|
| **LSP Binary** | `dolmenls` (OCaml) | `dafny server` (.NET) |
| **Session Model** | Shared process, multiple clients | Isolated process per user |
| **Session Management** | Client-managed | Server-managed with REST API |
| **Cleanup** | Manual | Automatic idle session cleanup |

### Session Management

The Dafny proxy provides REST endpoints for session lifecycle management:

```python
# Create a session explicitly
POST /sessions → {"session_id": "uuid", "status": "created"}

# Connect via WebSocket (with or without existing session)
WebSocket /lsp?session_id={id}

# Sessions are automatically cleaned up after inactivity
```

### Protocol Translation

The proxy translates between WebSocket JSON and LSP Content-Length format, similar to the Dolmen proxy:

```python
async def send_to_lsp(self, message: Dict[str, Any]):
    message_str = json.dumps(message)
    content = f"Content-Length: {len(message_str)}\r\n\r\n{message_str}"
    self.dafny_process.stdin.write(content.encode("utf-8"))
    await self.dafny_process.stdin.drain()
```

### Docker Configuration

The Dafny LSP proxy Docker container requires Dafny and .NET SDK:

```yaml
# compose.yml
dafny-lsp:
  build:
    context: ./dafny-lsp-proxy
  container_name: fmp-dafny-lsp
  ports:
    - "8080:8080"
```

For the frontend integration with Vite proxy:

```typescript
// vite.config.ts
'/lsp-dafny': {
    target: 'ws://fmp-dafny-lsp:8080',
    changeOrigin: true,
    secure: false,
    ws: true,
    rewrite: (path) => path.replace(/^\/lsp-dafny/, ''),
},
```


## Resources

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [WebSocket API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
- [Monaco Language Client](https://github.com/TypeFox/monaco-languageclient)

---

*← Back to [Language Server Integration](./language-servers.md)*

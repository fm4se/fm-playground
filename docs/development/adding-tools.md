# Adding New Tools

FM Playground is designed to be extensible, allowing you to add new formal methods tools easily. This guide walks you through the process of integrating a new tool into the platform.

## Overview

Each tool in FM Playground consists of:

- **API Service**: A containerized backend service that handles tool execution
!!! warning "Web Assembly (WASM) Tools"
    If your tool has WebAssembly (WASM) bindings, you can skip the backend service step. WASM tools can be executed directly in the browser without a separate backend. Examples in FM Playground include Z3 (SMT) and Limboole, which use WASM as the primary execution method with a backend service as fallback.
- **Frontend Integration**: UI components for tool interaction
- **Configuration**: Tool metadata and Docker orchestration

## Architecture Pattern

Integrating a new tool consists of two main steps:

1. **Frontend Integration**: Add the tool to the frontend, allowing users to interact with it through the UI.

    
2. **Backend Service**: Create a backend service that executes the tool and expose APIs for interaction. You can develop a new service or use existing APIs running anywhere that can be accessed by the frontend.


## Step 1: Choose Your Tool

For this example, we will integrate **nuXmv**, since it is already supported in FM Playground and the simplest to set up. However, the same principles apply to any tool you wish to add.

### Prerequisites

Before adding a tool, ensure:

- The tool can be automated/scripted e.g. via command line or API
- You understand its input/output formats
- Licensing allows redistribution (if including binaries)

## Step 2: Frontend Integration

First, we will integrate the tool into the FM Playground frontend. The frontend is where users will interact with your tool through the web interface.

### Overview
To add a new tool, you need to create the tool's frontend files manually and register it in the central `ToolMaps.tsx` configuration. Each tool requires an executor (for API calls), a TextMate grammar (for syntax highlighting), and optionally custom input/output components.

### Create Tool Files

Create a new directory for your tool under `frontend/tools/`:

```bash
mkdir -p frontend/tools/nuxmv
```

You'll create the following files:

```
frontend/tools/nuxmv/
├── nuxmvExecutor.ts           # Core execution logic
├── nuxmvTextMateGrammar.ts    # Syntax highlighting
└── nuxmvOutput.tsx            # Output component (optional)
```

#### Understanding Generated Files

##### Tool Executor

This file contains the logic to execute your tool. It typically includes an API call to your backend service, handling the tool's input and output. And export a function that can be called from the frontend to execute the tool.

```typescript hl_lines="2 9-11 15 29" linenums="1" title="nuxmvExecutor.ts"
async function executenuxmv(permalink: Permalink) {
  let url = `/nuxmv/run/?check=${permalink.check}&p=${permalink.permalink}`;
  const response = await axios.get(url);
  return response.data;
}

export const executenuxmvTool = async () => {
  // Get the contents of the editor, selected language, and permalink
  const editorValue = jotaiStore.get(editorValueAtom);
  const language = jotaiStore.get(languageAtom);
  const permalink = jotaiStore.get(permalinkAtom);
  
  // Save the code to the database
  // This will return the permalink object with the permalink and check
  const response = await saveCode(editorValue, language.short, permalink.permalink || null, null);
  if (response) {
    jotaiStore.set(permalinkAtom, response.data);
  } else {
    jotaiStore.set(
      outputAtom,
      `error handling ...`
    );
    jotaiStore.set(isExecutingAtom, false);
    return;
  }

  // With the returned permalink, we can now execute the tool
  try {
    const res = await executenuxmv(response?.data);
    jotaiStore.set(outputAtom, res);
  } catch (err: any) {
    jotaiStore.set(
      outputAtom,
      `error handling ...`
    );
  }
  jotaiStore.set(isExecutingAtom, false);
};
```

- **Line 2:** We define a proxy in the `vite.config.ts` file to redirect requests to the backend service. This allows us to call the API without worrying about CORS issues. You can modify the URL to point to your backend service if it's hosted elsewhere.

- **Lines 9-11:** The `executenuxmvTool` function retrieves the current editor value, language, and permalink from the state. It then saves the code to the database and executes the tool using the permalink.

- **Line 15:** Makes an API call to the backend service to save the specification and get the gereated permalink. This permalink is then used to execute the tool.

- **Line 29:** Calling the `executenuxmv` function with the permalink to execute the tool and retrieve the results.



##### TextMate Grammar

This file defines the syntax highlighting rules for your tool's language using TextMate grammar. It allows the Monaco editor to provide proper syntax highlighting when users write code in your tool's language.

You can refer to the [Monaco Editor documentation](https://microsoft.github.io/monaco-editor/monarch.html) for details on how to define your language's syntax.

```typescript hl_lines="2 18" linenums="1" title="nuxmvTextMateGrammar.ts"
// Language configuration for Monaco Editor
export const nuxmvConf: languages.LanguageConfiguration = {
  brackets: [
    ['{', '}'],
    ... // other brackets
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    ... // other pairs
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    ... // other pairs
  ]
};

// TextMate grammar for syntax highlighting
export const nuxmvLang: languages.IMonarchLanguage = {
  keywords: ['DEFINE','E', 'EBF', 'EBG', 'EF', 'EG','F'],
  operators: [':', '=', '->', '<->', '∀', '∃'],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  
  tokenizer: {
    root: [
      [/[a-zA-Z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@default': 'identifier'
        }
      }],
      [/\d+/, 'number'],
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string']
    ],
    // ... more tokenization rules
  }
};
```

- **Line 2:** Defines the language configuration for Monaco Editor, including brackets and auto-closing pairs.
- **Line 18:** Defines the TextMate grammar for syntax highlighting, including keywords, operators, and tokenization rules.

##### Output Component

For `? Output component type:`, if you selected `CustomOutput`, instead of a simple text output, a new file `nuxmvOutput.tsx` will be created. This file can contain custom React components to display the output of your tool in a more user-friendly way.

##### Additional Input and Output Components 

If you selected `Y` for creating an additional input and/or output component, a new file `nuxmvInput.tsx`and/or `nuxmvOutput.tsx` will be created. These files can contain custom React components to handle tool-specific input options and display results in a structured way.

For example, we choose to create an additional output component, `nuxmvOutput.tsx` might look like this:
```tsx title="nuxmvOutput.tsx" linenums="1"
const nuxmvOutput: React.FC = () => {
  return (
    <MDBContainer className="p-3">
      <MDBRow>
        <MDBCol md="12">
          <div className="border rounded p-3 bg-light">
            <h6 className="mb-2">nuxmv Information</h6>
          </div>
        </MDBCol>
      </MDBRow>
    </MDBContainer>
  );
};
export default nuxmvOutput;
```

### ToolMaps.tsx Integration

The `ToolMaps.tsx` file serves as the central registry that connects all tool components and configurations within the FM Playground frontend. Understanding this integration is crucial for customizing tool behavior and troubleshooting integration issues.

After creating your tool files, you need to register them in `ToolMaps.tsx`:

```typescript hl_lines="1" linenums="1" title="ToolMaps.tsx"
import TextualOutput from '@/components/Playground/TextualOutput';
import { nuxmvConf, nuxmvLang } from '@/../tools/nuxmv/nuxmvTextMateGrammar';
import { executenuxmvTool } from '@/../tools/nuxmv/nuxmvExecutor';
import nuxmvOutput from '@/../tools/nuxmv/nuxmvOutput';
import type { FmpConfig } from '@/types';

export const additionalInputAreaUiMap: Record<string, React.FC<any>> = {};
export const additonalOutputAreaUiMap: Record<string, React.FC<any>> = {
  XMV: nuxmvOutput,
};
export const toolExecutionMap: Record<string, () => void> = {
  XMV: executenuxmvTool,
};
export const toolOutputMap: Record<string, React.FC<any>> = {
  XMV: TextualOutput,
};

export const languageConfigMap: Record<string, { tokenProvider: any; configuration: any }> = {
  XMV: { tokenProvider: nuxmvLang, configuration: nuxmvConf },
};

// Configuration for LSP (Language Server Protocol) support by tool
export const lspSupportMap: Record<string, boolean> = {
  XMV: false,
};

export const fmpConfig: FmpConfig = {
  title: 'FM Playground',
  repository: 'https://github.com/se-buw/fm-playground',
  issues: 'https://github.com/se-buw/fm-playground/issues',
  tools: {
    nuxmv: { name: 'nuxmv', extension: 'XMV', shortName: 'XMV' },
  },
};
```

#### Understanding the Mapping Objects

**1. `additionalInputAreaUiMap`**

- **Purpose**: Maps tool IDs to custom input components that appear below the code editor
- **Usage**: For tools requiring specific configuration options, parameter inputs, or command-line flags
- **Example**: Alloy's command selection, Spectra's CLI options
- **When to use**: When your tool needs user-configurable parameters before execution

**2. `additonalOutputAreaUiMap`**

- **Purpose**: Maps tool IDs to additional UI components that appear in the output area
- **Usage**: For supplementary information, tool credits, copyright notices, or interactive result exploration
- **Example**: nuXmv's copyright notice, Alloy's instance navigation controls
- **When to use**: When you need to display non-result information alongside tool output

**3. `toolExecutionMap`**

- **Purpose**: Maps tool IDs to their execution functions
- **Critical**: This is the core mapping that enables tool execution
- **Function signature**: `() => void` - typically async functions that handle the complete execution flow
- **Responsibility**: Manages editor content saving, API calls, result handling, and error management

**4. `toolOutputMap`**

- **Purpose**: Maps tool IDs to their primary output rendering components
- **Default**: `TextualOutput` for simple text-based results
- **Custom options**: `AlloyOutput` for graph visualization, custom components for structured data
- **When to customize**: When tool results require special formatting, visualization, or interaction

**5. `languageConfigMap`**

- **Purpose**: Configures Monaco Editor language support for each tool
- **Components**: 

    - `tokenProvider`: Defines syntax highlighting rules (TextMate grammar)
    - `configuration`: Sets language behavior (brackets, auto-completion, indentation)

- **Impact**: Directly affects the code editing experience and syntax highlighting quality

**6. `lspSupportMap`**

- **Purpose**: Indicates whether a tool supports Language Server Protocol features
- **Features enabled**: Real-time error checking, intelligent auto-completion, semantic highlighting
- **Current support**: Limboole, SMT (partial), Spectra, Dafny (external LSP)
- **Development**: New tools can implement LSP for enhanced editing experience

**7. `fmpConfig`**

- **Purpose**: Central configuration object defining all available tools
- **Structure**: Each tool entry contains:

    - `name`: Internal identifier for the tool
    - `extension`: File extension and language identifier for Monaco Editor
    - `shortName`: Uppercase identifier used in all mapping objects
    
- **Consistency**: The `shortName` must match across all mapping objects for proper tool registration

#### Advanced Configuration

You may need to adjust configurations for advanced features:

```typescript title="ToolMaps.tsx" linenums="1"
// Adding custom input component
export const additionalInputAreaUiMap: Record<string, React.FC<any>> = {
  NUXMV: NuxmvModelOptions, // Custom component for model checking options
};

// Enabling LSP support (requires separate LSP server implementation)
export const lspSupportMap: Record<string, boolean> = {
  NUXMV: true, // Enable after implementing LSP server
};

// Using custom output renderer
export const toolOutputMap: Record<string, React.FC<any>> = {
  NUXMV: NuxmvGraphOutput, // Custom component for counterexample visualization
};
```

#### Troubleshooting Integration

**Common Issues:**

1. **Tool not appearing in interface**: Check that the tool is properly added to `fmpConfig.tools`
2. **Execution not working**: Verify `toolExecutionMap` contains the correct function reference
3. **Syntax highlighting missing**: Ensure `languageConfigMap` includes both `tokenProvider` and `configuration`
4. **Custom components not loading**: Check import statements and component exports

**Validation Steps:**

1. Verify all imports resolve correctly
2. Ensure tool ID consistency across all mappings
3. Test that execution function is properly exported
4. Confirm language grammar is syntactically correct

This mapping system provides a clean separation between tool logic and platform integration, enabling the FM Playground to support diverse formal methods tools while maintaining a consistent user experience.

## Step 3: Create the API Service

We will create a new [FastAPI](https://fastapi.tiangolo.com/) service that wraps the nuXmv tool, allowing it to be executed via HTTP requests.

!!! note "Note"
    If you have an existing API for the tool, you can skip this step and directly integrate it into the frontend.

We will utilize poetry to manage our Python dependencies and create a FastAPI service that will execute the nuXmv tool.

```python
# Install Poetry if not already installed
poetry new nuxmv-api
```

This will create a new directory `nuxmv-api` with the following structure:

```
nuxmv-api/
├── nuxmv_api/
│   ├── __init__.py
│   └── main.py
├── tests/
│   └── __init__.py
├── pyproject.toml
└── README.md
```

Now, we will add the necessary dependencies and implement the service.
### Update `pyproject.toml`
```toml
[tool.poetry.dependencies]
python = "^3.10" # Adjust based on your Python version
fastapi = {extras = ["standard"], version = "^0.115.2"}
httpx = "^0.27.0"
pytest = "^8.3.2"
pytest-asyncio = "^0.23.8"
requests = "^2.32.3"
uvicorn = "^0.30.5"
redis = "^5.0.8"
python-dotenv = "^1.0.1"
python-redis-cache = "^4.0.1"
```

Install the dependencies:

```bash
cd nuxmv-api
poetry install
```

### Download nuXmv

Create a `lib/` directory in the `nuxmv-api` folder to store the nuXmv binary:

```bash
mkdir nuxmv_api/lib
```

Download the [nuXmv binary](https://nuxmv.fbk.eu/download.html) and place the executables in the `nuxmv_api/lib/` directory. Ensure the binary is executable:

```bash
chmod +x nuxmv_api/lib/nuxmv
```


### Create the FastAPI Service
Create `nuxmv_api/main.py`:

```python
# nuxmv_api/main.py
# ... 
app = FastAPI()

# Route to run nuXmv
@app.get("/xmv/run/", response_model=None)
def code(check: str, p: str):
    code = get_code_by_permalink(check, p)
    try:
        return run_nuxmv(code)
    except Exception:
        raise HTTPException(status_code=500, detail="Error running code")
```

This service will expose an endpoint `/xmv/run/` that accepts a `check` and `p` parameter, retrieves the code associated with those parameters, and runs the nuXmv tool on it. For the sake of this example, we will assume that `get_code_by_permalink` is a function that retrieves the code based on the provided parameters. For a complete implementation, see the [nuXmv API](https://github.com/fm4se/fm-playground/blob/main/nuxmv-api/main.py)


### Implement the Tool Execution Logic
Create `nuxmv_api/nuxmv.py`:

```python
def run_nuxmv(code: str) -> str:
    tmp_file = tempfile.NamedTemporaryFile(mode="w", delete=False)
    tmp_file.write(code.strip())
    tmp_file.close()

    NU_XMV_PATH = os.path.join(os.path.dirname(__file__), "lib", "nuxmv")
    command = [NU_XMV_PATH, "-dynamic", tmp_file.name]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60)
        os.remove(tmp_file.name)
        if result.returncode != 0:
            return prettify_error(result.stderr)
        return prettify_output(result.stdout) + prettify_error(result.stderr)
    except subprocess.TimeoutExpired:
        os.remove(tmp_file.name)
        return "<i style='color: red;'>Timeout: Process timed out after 60 seconds.</i>"
```
This function creates a temporary file with the provided code, runs the nuXmv tool on it, and returns the output. It handles errors and timeouts gracefully.


!!! warning "Warning"
    This is an example implementation with minimal effort to keep it simple. In a production environment, you should handle security, input validation, and error handling more robustly. Our primary focus is on demonstrating the integration pattern in the FM Playground.




## Best Practices

### Security

- **Timeout Execution**: Always set timeouts for tool execution
- **Resource Limits**: Use Docker resource constraints
- **Input Validation**: Sanitize user inputs
- **Sandboxing**: Run tools in isolated containers

### Performance

- **Caching**: Cache tool binaries and dependencies
- **Parallel Execution**: Design for concurrent requests
- **Resource Management**: Clean up temporary files

## Related Documentation

- [API Reference](api-reference.md) - Backend API documentation
- [Deployment Guide](deployment.md) - Deploying the application
- [Language Servers](language-servers.md) - Adding LSP support to your tool

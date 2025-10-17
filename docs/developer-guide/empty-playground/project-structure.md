# Project Structure Guide

This guide explains the structure of your FM Playground project created with `fmp-create`.

## Overview

Your project follows a microservices architecture with separate services for frontend, backend, and each formal method tool.

```
my-fm-playground/
├── frontend/          # React TypeScript application
├── backend/           # Python Flask/FastAPI server  
├── [tool-name]-api/   # Tool-specific microservices
├── compose.yml        # Docker Compose configuration
└── README.md          # Project documentation
```

## Frontend Structure

The frontend structure is similar to 

```
frontend/
│   ├── src/
│   │   ├── api/            # API client functions
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React contexts for global state
│   │   ├── types/          # TypeScript type definitions
│   │   ├── atoms.tsx       # Jotai state management
│   │   ├── ToolMaps.tsx    # Tool registration and config
│   │   └── App.tsx         # Main application component
├── tools/                  # Tool implementations
│   ├── common/             # Shared utilities
│   └── [tools]/            # Based on selection
├── public/                 # Static assets
│── index.html              # HTML template
│── .env.example            # Environment variables example
│── vite.config.ts          # Vite build configuration
│── package.json            # Frontend dependencies
│── tsconfig.json           # TypeScript configuration
│── Dockerfile              # Container configuration
```

### Key Frontend Files

- `src/ToolMaps.tsx`
Central configuration for all tools. If you selected only Alloy and Limboole, it would look like this:

```typescript
export const fmpConfig: FmpConfig = {
  title: 'FM Playground',
  repository: 'https://github.com/fm4se/fm-playground',
  issues: 'https://github.com/fm4se/fm-playground/issues',
  tools: {
    als: { name: 'Alloy', extension: 'als', shortName: 'ALS' },
    // ... other tools
  },
};
```

- `src/atoms.tsx`
Global state management with Jotai:

```typescript
export const currentEditorValueAtom = atom('');
export const languageAtom = atom('alloy');
export const outputAtom = atom('');
export const isExecutingAtom = atom(false);
```

- `tools/[tool-name]/`
Each tool has its own directory with:
    - **Executor**: Core execution logic
    - **TextMate Grammar**: Syntax highlighting
    - **Components**: Optional UI components

!!! note "Note"
    The ``backend`` and `{tool}-api` structures are same as described in the [Tailered Playground Structure](../tailered-playground/project-structure.md#backend-architecture) guide.


## Service Communication

### Frontend ↔ Backend

The frontend communicates with the backend using Axios for API requests. For example, to save specifications:

```typescript
// frontend/src/api/playgroundApi.ts
export async function saveCode(
    code: string,
    check: string,
    parent: string | null,
    metadata: Record<string, any> | null
) {
    let url = `${API_URL}/save`;
    const md = {
        ...metadata,
        'fmp-version': FMP_VERSION,
    };
    let meta = JSON.stringify(md);
    const response = await axiosAuth.post(url, { code, check, parent, meta });
    if (response.status === 200) {
        return response;
    }
}
```

This function sends a POST request to the backend to save the specification, check type, parent ID, and metadata. The backend save the specifications and returns the permalink. Then this permalink is sent to the tool API for execution. The tool API will fetch the specification from the backend and execute it and return the result.

### Backend ↔ Tool APIs

```typescript
// frontend/tools/nuxmv/nuxmvExecutor.ts
async function executeNuxmv(permalink: Permalink) {
    let url = `/nuxmv/xmv/run/?check=${permalink.check}&p=${permalink.permalink}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        throw error;
    }
}
```
This function calls the nuXmv API to execute a specification. It constructs the URL with the permalink and check type, then sends a GET request to the tool API.

!!! note "Note"
    In the above example, the url is relative to the frontend server. This is because the frontend is configured to proxy requests in the `vite.config.ts` file. For example: 
```typescript
proxy: {
  '/nuxmv': {
    target: 'http://localhost:8082', // nuXmv API server
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path.replace(/^\/nuxmv/, ''),
  },
}
```











## Next Steps

Now that you understand the structure:

1. **[Add New Tools →](../../development/adding-tools.md)** - Extend the playground with custom tools
2. **[Deploy →](../../development/deployment.md)** - Test changes and build for production


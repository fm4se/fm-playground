# Working with Existing Project

This guide covers setting up your FM Playground by forking the existing repository. This approach gives you access to all existing tools and the complete codebase.

## Overview

The existing project approach is ideal when you:

- Want all formal method tools (Alloy, Limboole, nuXmv, SMT/Z3, Spectra, Dafny) currently available on the FM Playground
- Need a comprehensive starting point with full features
- Plan to contribute back to the main project
- Want to learn from existing tool implementations
- Prefer to customize existing tools rather than build from scratch

## Prerequisites

Before you begin, ensure you have:

- **Node.js** (version 20 or higher) - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **GitHub Account** - [Sign up here](https://github.com/)
- **Code Editor** - VS Code recommended

### Verify Your Setup

```bash
# Check Node.js version
node --version
# Should show version 20.x.x or higher

# Check npm version  
npm --version
# Should show version 10.x.x or higher

# Check Git
git --version
# Should show git version
```

## Step 1: Fork the Repository

1. **Navigate to the main repository**
      - [https://github.com/fm4se/fm-playground](https://github.com/fm4se/fm-playground)

2. **Fork the repository**
      
      - Click the **"Fork"** button in the top-right corner
      - Choose your GitHub account as the destination
      - Keep the repository name as `fm-playground` or customize it
      - Ensure "Copy the main branch only" is checked
      - Click **"Create fork"**

3. **Verify your fork**
   
   You should now see the repository at `https://github.com/YOUR_USERNAME/fm-playground`

## Step 2: Clone Your Fork

```bash
# Clone your forked repository
git clone https://github.com/YOUR_USERNAME/fm-playground.git

# Navigate to the project directory
cd fm-playground

# Add the original repository as upstream (for future updates)
git remote add upstream https://github.com/fm4se/fm-playground.git

# Verify your remotes
git remote -v
# Should show:
# origin    https://github.com/YOUR_USERNAME/fm-playground.git (fetch)
# origin    https://github.com/YOUR_USERNAME/fm-playground.git (push)
# upstream  https://github.com/fm4se/fm-playground.git (fetch)
# upstream  https://github.com/fm4se/fm-playground.git (push)
```

## Step 3: Environment Variables
The FM Playground uses environment variables for configuration. Each service (frontend, backend, and tools) has its own `.env` file. You will need to set up these files to run the project locally. An example `.env` file is provided for each service named `.env.example`. You can copy these files and update them with your specific configuration.

```bash
# In the project root directory
cp .env.example .env

# Navigate to frontend directory and copy the example env file and update it
cd frontend
cp .env.example .env

# Navigate to backend directory and copy the example env file and update it
cd ../backend
cp .env.example .env

# Navigate to each tool directory and copy the example env file and update it
cd limboole-api
cp .env.example .env
# ... repeat for other tools 

# Note: Use copy command appropriate for your OS 
#     (e.g., `copy` on Windows, `cp` on Linux/Mac)
```

### Frontend `.env` example
```env
# API URL for the FM Playground backend
VITE_FMP_API_URL=http://localhost:8000/api

# Version of the FM Playground. This is used for docker images.
VITE_FMP_VERSION=1.5.0
```

### Backend `.env` example
```env
# Frontend URL for the FM Playground
FRONTEND_URL="http://localhost:5173/" 

# API URL for the FM Playground backend
VITE_FMP_API_URL=http://localhost:8000/api

# Database configuration
# Note: If you are using PostgreSQL, ensure you have it running and the credentials match
# If you prefer SQLite, set USE_SQLITE=True
USE_SQLITE=True
# PostgreSQL configuration
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=postgres
DB_HOST=postgres
DB_PORT=5432

# Secret key for Flask sessions
# This should be a strong random key for production
APP_SECKET_KEY="secret-key"
# Flask environment (development or production)
FLASK_ENV=development

# OAuth configuration
# These are used for Google and GitHub authentication
# You can create OAuth applications on Google and GitHub to get these credentials
GOOGLE_CLIENT_ID="google-client-id"
GOOGLE_CLIENT_SECRET="google-client-secret"
GITHUB_CLIENT_ID="github-client-id"
GITHUB_CLIENT_SECRET="github-client-secret"
```

### Tool `.env` example
Each tool may have its own `.env` file with specific configurations. Two primary variables are common in python-based tools:

```env
# API URL for the FM Playground 
API_URL = "https://play.formal-methods.net/"
# Redis URL for caching and task management
REDIS_URL = "redis://localhost:6379/0"
```
Other tools may have additional configurations specific to their requirements. Check the `.env.example` file in each tool's directory for details.


## Step 3: Install Dependencies

The FM Playground consists of both frontend and backend components:

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

```

### Backend Setup

```bash
# Navigate to backend directory (from project root)
cd backend

# Install poetry environment (if not already installed)
poetry install --no-root 
```

### Tool Specific Setup

Each tool runs on its own backend service. Different tools may have different dependencies or setup requirements.

#### Alloy

Alloy uses a Java backend. Ensure you have Java 17 or higher installed. To install Alloy dependencies, run:

```bash
# Navigate to Alloy tool directory
cd alloy-api

# Install Alloy dependencies and build the project
./gradlew clean build -x test
```

#### Limboole

In the FM Playground, Limboole is running as a WebAssembly module. You can run it directly in the browser without additional setup. Though, for the completeness of the setup, you can also run it as a backend service. We are using FastAPI for the Limboole API.

```bash
# Navigate to Limboole tool directory
cd limboole-api
# Install Limboole dependencies
poetry install --no-root
```

!!! note "Note"
      The `limboole-api` directory contains both the WebAssembly module and the FastAPI backend service. The WebAssembly module is used by default, but you can switch to the backend service if needed. You need to install the `limboole` binary and place it in the `lib/` directory if you want to run the backend service.

#### nuXmv 
nuXmv is running as a backend service using FastAPI. 

```bash
# Navigate to nuXmv tool directory
cd nuxmv-api
# Install nuXmv dependencies
poetry install --no-root

# Copy the nuXmv binary to the tool directory
./install_dependencies.sh
# This will download the nuXmv binary and place it in the correct location
```
!!! note "Note"
    The `install_dependencies.sh` script downloads the linux binary of nuXmv. If you are on a different OS, you may need to modify this script or manually download the appropriate binary and place it in the `lib/` directory.

#### SMT/Z3
In the FM Playground, SMT/Z3 is running a WebAssembly module. It also has a backend service using FastAPI. In case the WebAssembly module fails, it falls back to the backend service.

```bash
# Navigate to SMT/Z3 tool directory
cd z3-api
# Install SMT/Z3 dependencies
poetry install --no-root
```

!!! note "Note"
      The `z3-api` directory contains both the WebAssembly module and the FastAPI backend service. The WebAssembly module is used by default, but you can switch to the backend service if needed. You need to install the `z3` binary if you want to run the backend service.

#### Spectra
Spectra is running as a backend service using FastAPI. 

```bash
# Navigate to Spectra tool directory
cd spectra-api
# Install Spectra dependencies
poetry install --no-root  
# This will set up the Python environment and install necessary packages for Spectra
```

#### Dafny
Dafny consists of two services: an execution API and a Language Server Protocol (LSP) proxy. The Dafny API handles code verification, execution, and translation to other languages. The LSP proxy provides real-time editing features via WebSocket.

```bash
# Navigate to Dafny API directory
cd dafny-api
# Install Dafny API dependencies
poetry install --no-root
```

!!! note "Note"
    The Dafny API requires Dafny 4.x and .NET 8.0 SDK to be installed locally for development without Docker. The Dockerfile handles these installations automatically for containerized deployment.

```bash
# Navigate to Dafny LSP proxy directory
cd dafny-lsp-proxy
# Install LSP proxy dependencies
poetry install --no-root
```

!!! note "Note"
    The Dafny LSP proxy requires the `dafny server` command to be available. The Dockerfile installs Dafny automatically. For local development, ensure Dafny is installed and available in your PATH.

## Step 4: Start Development Environment

```bash
# From the project root, you can start both frontend and backend

# Terminal 1: Start frontend
cd frontend
npm run dev
# Frontend will be available at http://localhost:5173

# Terminal 2: Start backend (in a new terminal)
cd backend  
python app.py
# Backend API will be available at http://localhost:8000
```

### Tool-Specific Backend Services
You can start each tool's backend service in separate terminals:

!!! note "Note"
      Each tool's backend service runs independently. You don't need to run all of them unless you want to test all tools simultaneously.


```bash
# Start Alloy backend
cd alloy-api
./gradlew bootRun
# Alloy backend will be available at http://localhost:8080

# Start Limboole backend
cd limboole-api
fastapi run main.py --port 8081

# Start nuXmv backend
cd nuxmv-api
fastapi run main.py --port 8082

# Start SMT/Z3 backend
cd z3-api
fastapi run main.py --port 8083

# Start Spectra backend
cd spectra-api
fastapi run main.py --port 8084
```


## Step 5: Verify Your Setup

1. **Check Frontend**
   
   Open [http://localhost:5173](http://localhost:5173) in your browser. You should see:
   - The FM Playground interface
   - All the tools listed in the top (Alloy, Limboole, nuXmv, SMT, Spectra)

2. **Test a Tool**
   
   - Select "Limboole" from the sidebar
   - Enter a simple boolean formula: `(a & b) | c`
   - Click "Run" to test the tool execution
   - Verify you get output


You have successfully set up your FM Playground with all existing tools! You can now start developing new tools, modifying existing ones, or contributing back to the main project.

## 🎯 Next Steps

Now that you have the basic setup running, you can:

1. **[Explore the Project Structure →](project-structure.md)** - Understand the codebase organization
2. **[Add New Tools →](../../development/adding-tools.md)** - Extend the playground with custom tools
3. **[Deploy →](../../development/deployment.md)** - Test changes and build for production

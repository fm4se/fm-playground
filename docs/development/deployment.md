# Deployment Guide

This guide shows you how to deploy the FM Playground for development and production environments.

## Prerequisites

If you haven't already setup the project, please follow the [setup guide](../developer-guide/tailered-playground/index.md).

## Quick Start

### Create Environment Configuration

Create a `.env` file in the project root:

```bash
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=postgres
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres

# Flask Configuration
FLASK_ENV=development
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-here

# Redis Configuration
REDIS_URL=redis://redis:6379/0

# API Configuration
API_URL=http://fmp-backend:8000/

# Frontend Configuration
VITE_FMP_API_URL=http://127.0.0.1:8000/api
```

### Create Docker Network

```bash
docker network create my_network
```

### Start the Application

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **PgAdmin**: http://localhost:5050 (admin tools)
- **RedisInsight**: http://localhost:5540 (Redis management)

## Service Architecture

### Core Services

#### Frontend (`fmp-frontend`)
```yaml
frontend:
  build: 
    context: ./frontend
    args:
      VITE_FMP_API_URL: http://127.0.0.1:8000/api
  container_name: fmp-frontend
  ports:
    - "5173:5173"
```

- **Purpose**: Serves the web application
- **Technology**: Vite + React + TypeScript
- **Port**: 5173

#### Backend (`fmp-backend`)
```yaml
backend:
  build:
    context: ./backend
  container_name: fmp-backend
  ports:
    - "8000:8000"
  depends_on:
    postgres:
      condition: service_healthy
```

- **Purpose**: Main API server and business logic
- **Technology**: Flask/FastAPI + Python
- **Port**: 8000
- **Dependencies**: PostgreSQL database

#### Database (`fmp-db`)
```yaml
postgres:
  image: postgres:15.4
  container_name: fmp-db
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: postgres
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: [ "CMD-SHELL", "pg_isready -U postgres" ]
    interval: 5s
    timeout: 5s
    retries: 5

```
- **Purpose**: Primary data storage
- **Technology**: PostgreSQL 15.4
- **Data**: Persistent volume for data storage
- **Health Check**: Ensures database is ready before starting dependent services

### Tool Services

#### Z3 SMT Solver (`fmp-z3-api`)
```yaml
z3:
  build:
    context: ./z3-api
  container_name: fmp-z3-api
  environment:
    REDIS_URL: redis://redis:6379/0
```

- **Purpose**: Z3 SMT solver integration
- **Technology**: Python + Z3 bindings
- **Dependencies**: Redis for caching

#### nuXmv Model Checker (`fmp-nuxmv-api`)
```yaml
nuxmv:
  build:
    context: ./nuxmv-api
  container_name: fmp-nuxmv-api
  environment:
    REDIS_URL: redis://redis:6379/0
```

- **Purpose**: nuXmv temporal logic model checking
- **Technology**: Python + nuXmv binary
- **Dependencies**: Redis for caching

#### Alloy Analyzer (`fmp-alloy-api`)
```yaml
alloy:
  build:
    context: ./alloy-api
  container_name: fmp-alloy-api
```

- **Purpose**: Alloy structural modeling and analysis
- **Technology**: Java + Alloy library
- **Features**: Model finding and instance generation

#### Spectra Synthesis (`fmp-spectra-api`)
```yaml
spectra:
  build:
    context: ./spectra-api
  container_name: fmp-spectra-api
  environment:
    REDIS_URL: redis://redis:6379/0
```

- **Purpose**: Spectra reactive synthesis
- **Technology**: Python + Spectra tools
- **Dependencies**: Redis for caching

#### Dafny Verification (`fmp-dafny-api`)
```yaml
dafny-api:
  build:
    context: ./dafny-api
  container_name: fmp-dafny-api
  environment:
    API_URL: http://fmp-backend:8000/
    USE_GVISOR: "true"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

- **Purpose**: Dafny code verification, execution, and translation
- **Technology**: Python + Dafny 4.x + .NET 8.0
- **Port**: 8085
- **Features**: Verify, run, and translate Dafny code to py/cs/java/go/js
- **Security**: Uses Docker with gVisor for sandboxed code execution

#### Dafny LSP Proxy (`fmp-dafny-lsp`)
```yaml
dafny-lsp:
  build:
    context: ./dafny-lsp-proxy
  container_name: fmp-dafny-lsp
```

- **Purpose**: Language Server Protocol proxy for Dafny
- **Technology**: Python + Dafny server
- **Port**: 8080
- **Features**: Real-time diagnostics, completions, and hover info via WebSocket

### Supporting Services

#### Redis Cache (`fmp-redis`)
```yaml
redis:
  image: redis:alpine
  container_name: fmp-redis
  ports:
    - "6379:6379"
```

- **Purpose**: Session storage and API caching
- **Technology**: Redis Alpine
- **Port**: 6379

#### Admin Tools

**PgAdmin** (`fmp-pgadmin`)
```yaml
pgadmin:
  image: dpage/pgadmin4:latest
  container_name: fmp-pgadmin
  environment:
    PGADMIN_DEFAULT_EMAIL: soaib@soaib.me
    PGADMIN_DEFAULT_PASSWORD: Soaib@123
  ports:
    - "5050:80"
```

- **Purpose**: PostgreSQL database administration
- **Access**: http://localhost:5050
- **Credentials**: Set in environment variables

**RedisInsight** (`fmp-redisinsight`)
```yaml
redisinsight:
  image: redis/redisinsight:latest
  container_name: fmp-redisinsight
  ports:
    - "5540:5540"
```

- **Purpose**: Redis monitoring and management
- **Access**: http://localhost:5540

## Development Deployment

### Local Development

```bash
# Start core services only
docker-compose up frontend backend postgres redis -d

# Start specific tool services as needed
docker-compose up z3 alloy -d

# Hot reload for frontend development
cd frontend
npm run dev

# Backend development with auto-reload
cd backend
pip install -r requirements.txt
python app.py 
```

### Development with SQLite

For simpler development setup, you can use SQLite instead of PostgreSQL:

1. Update `.env`:
```bash
DATABASE_URL=sqlite:///./instance/fmp.db
```

2. Remove PostgreSQL dependency from `compose.yml`:
```yaml
backend:
  build:
    context: ./backend
  container_name: fmp-backend
  # Remove depends_on section
```

3. Start without PostgreSQL:
```bash
docker-compose up frontend backend redis z3 alloy -d
```

## Production Deployment

### Environment Configuration

Create a production `.env` file:

```bash
# Production Database
POSTGRES_USER=fmp_prod_user
POSTGRES_PASSWORD=secure_password_here
POSTGRES_DB=fmp_production
DATABASE_URL=postgresql://fmp_prod_user:secure_password_here@postgres:5432/fmp_production

# Production Flask Settings
FLASK_ENV=production
SECRET_KEY=very-secure-secret-key
JWT_SECRET_KEY=very-secure-jwt-key

# Redis Configuration
REDIS_URL=redis://redis:6379/0

# API Configuration
API_URL=https://your-domain.com/api/

# Frontend Configuration
VITE_FMP_API_URL=https://your-domain.com/api
```

### Production Deployment Steps

1. **Secure the Environment**
```bash
# Generate secure keys
openssl rand -base64 32  # For SECRET_KEY
openssl rand -base64 32  # For JWT_SECRET_KEY

# Update .env with secure values
```

2. **Build and Deploy**
```bash
# Pull latest code
git pull origin main

# Build all images
docker-compose build

# Start production services
docker-compose up -d

# Verify all services are healthy
docker-compose ps
docker-compose logs --tail=50
```

### Reverse Proxy Configuration

For production, use a reverse proxy like Nginx:

```nginx
# /etc/nginx/sites-available/fm-playground
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for language servers
    location /ws/ {
        proxy_pass http://localhost:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Dafny LSP WebSocket proxy
    location /lsp-dafny/ {
        proxy_pass http://localhost:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Dafny API proxy
    location /dafny/ {
        proxy_pass http://localhost:8085/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Backup and Recovery

**Database Backup**


**Volume Backup**

**Scaling Tool Services**
```bash
# Scale tool APIs for high load
docker-compose up --scale z3=3 --scale alloy=2 -d
```

*← Back to [Developer Guide](../developer-guide/index.md)*
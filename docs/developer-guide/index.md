# FM Playground Developer Guide

Formal Methods (FM) Playground is a web platform for running and experimenting with different formal methods tools. It is designed to be integrated any formal methods tool that can be run without installation on the local machine. The platform is built using modern web technologies and provides a user-friendly interface for interacting with formal methods tools.


# Getting Started

This guide will help you to set up your own instance of the FM Playground and add/modify tools.

## 🍴 Setting Up Your Playground

**Best for:** Developers who want access to all existing tools and prefer a complete codebase as starting point.

Fork the existing repository to get all formal method tools (Alloy, Limboole, nuXmv, SMT/Z3, Spectra, Dafny) and build upon them. This approach gives you the full codebase to work with.

**[📖 Read the setup guide →](tailered-playground/index.md)**

---

## 🛠️ Adding Custom Tools

Once your playground is set up, you can extend it with your own formal methods tools. Each tool integration involves creating frontend components and a backend API service.

### Key Features

- **Template-based**: Follow existing tool patterns to create new integrations
- **Modular Architecture**: Each tool runs as an independent microservice
- **Flexible Options**: Support for custom input/output components and language servers

**[📖 Learn more about tool development →](../development/adding-tools.md)**

---

## Quick Navigation

- **[Setup Guide →](tailered-playground/index.md)** - Fork and extend the full repository
- **[Project Structure →](tailered-playground/project-structure.md)** - Understand the codebase architecture
- **[Development Guide →](../development/adding-tools.md)** - Learn about tool development
- **[API Reference →](../development/api-reference.md)** - Technical documentation
- **[Main Repository →](https://github.com/fm4se/fm-playground)** - Source code and issues

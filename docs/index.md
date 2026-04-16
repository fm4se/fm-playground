# FM Playground User Guide

Formal Methods (FM) Playground is a web platform for running and experimenting with different formal methods tools. It is designed to be integrated any formal methods tool that can be run without installation on the local machine. The platform is built using modern web technologies and provides a user-friendly interface for interacting with formal methods tools.

## Features

The FM Playground offers the following tools by default:

- **Limboole**: A SAT-based tool for Boolean reasoning.
- **SMT**: An SMT solver (Z3) for checking the satisfiability of logical formulas.
- **nuXmv**: A symbolic model checker for the finite-state and infinite-state systems.
- **Alloy**: A declarative modeling language for software systems.
- **Spectra**: A synthesis tool for reactive systems.
- **Dafny**: A verification-aware programming language for writing correct-by-construction software.

!!! tip "More Tools"
    The FM Playground is designed to be extensible, allowing users to add their own tools and configurations. If you have a tool that you want to integrate into the FM Playground, follow the [guide on how to add a new tool](development/adding-tools.md).

## Overview and Examples

Visit [play.formal-methods.net](https://play.formal-methods.net) to access the FM Playground. No installation is required - everything runs in your browser!

We started a small overview of the features of the FM Playground and how to use it. The video playlist is available on [YouTube](https://www.youtube.com/playlist?list=PLGyeoukah9NYq9ULsIuADG2r2QjX530nf)

<div style="text-align: center;">
   <iframe width="560" height="315"
      src="https://www.youtube.com/embed/videoseries?list=PLGyeoukah9NYq9ULsIuADG2r2QjX530nf"
      title="FM Playground Overview"
      frameborder="0"
      allow="autoplay; encrypted-media"
      allowfullscreen>
   </iframe>
</div>

There also some examples for each tool available in the bottom of the page. You can use these examples to get started with the tools and see how they work.

## Usage

### Writing Specification

1. **Select a Tool**: Click on the tool name in the toolbar
2. **Start Typing**: The editor provides syntax highlighting automatically
3. **Error Detection**: Red squiggly lines indicate syntax errors
4. **Auto-completion**: Use Ctrl+Space for suggestions

!!! warning "LSP Support"
    Not all tools support Language Server Protocol (LSP) features like auto-completion and error detection. We are working on improving this feature for all tools.
    Currently, **Limboole, SMT (in beta), Spectra, and Dafny** support LSP features. 

### Running Specification

1. **Click Run**: Press the "RUN" button
2. **View Results**: Check the output panel for results
3. **Error Handling**: Errors are displayed with line numbers
4. **Timeout**: Long-running processes are automatically terminated (default 60 seconds)

### Sharing Specification

1. **Generate Link**: Your specification is automatically saved with a unique permalink
2. **Copy URL :material-share-variant:**: Copy the browser URL to share your specification
3. **Version History**: Each "RUN" creates a new version of your specification
4. **Forking**: Others can modify and save their own versions not affecting your original specification

### File Management

#### Uploading Files :material-upload:
1. Click the **:material-upload:** upload button
2. Select a file with the appropriate extension
3. The file content loads into the editor
4. File format is automatically detected

#### Downloading Files :material-download:
1. Click the **:material-download:** download button
2. Choose filename and location (default is `<permalink>.<tool_extension>`)
3. File is saved with correct extension
4. Preserves all formatting and syntax

### User Accounts
You DON'T need to create an account to use the FM Playground, but signing in provides additional benefits.

#### Signing In
1. Click "LOGIN" in the top right
2. Choose Google or GitHub OAuth
3. Grant necessary permissions
4. Account will be created automatically if it doesn't exist

#### Benefits of Signing In
- **History**: Access all your previous work
- **Search**: Find specific specification snippets
- **Backup**: Never lose your work

#### Viewing History
1. Sign in to your account
2. Click the history icon
3. Browse chronologically
4. Click any item to load it in the editor

!!! note "Results in History"
    The history only contains the specification you wrote, not the output of the tools. You can run the specification again to see the results.

#### Searching Specification
1. Use the search box in history
2. Search by content


#### Managing Account
- **Export**: Download all your specification as a JSON file
- **Delete**: You can delete your account at any time
!!! warning "Deleting Account"
    Deleting your account will UNLINK all your specification from your account. But the specification will still be available via the permalinks. 

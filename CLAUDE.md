# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Testing
- `pnpm test` - Run all Playwright tests
- `pnpm run ctest` - Run tests in Chrome only
- `pnpm run ftest` - Run tests in Firefox only
- `pnpm run wtest` - Run tests in WebKit only
- `pnpm run dtest` - Run Docker tests (requires MCP_IN_DOCKER=1)

### Build & Linting
- `pnpm run lint` - Run linting (updates README)
- `pnpm run update-readme` - Update README with latest tool documentation
- `pnpm run docker-build` - Build Docker image for development

### Development Workflow
- `pnpm run copy-config` - Copy configuration from Playwright monorepo
- `pnpm run roll` - Copy config and run lint

## Architecture

### Repository Structure
This repository is a **distribution package** for the Playwright MCP server. The actual source code lives in the [Playwright monorepo](https://github.com/microsoft/playwright) at `packages/playwright/src/mcp/`.

**Key Files:**
- `cli.js` - Main CLI entry point that delegates to Playwright monorepo code
- `index.js` - Library export that exposes `createConnection` from Playwright
- `package.json` - Defines the MCP server package and CLI binary
- `tests/` - Test files for the MCP server functionality
- `extension/` - Chrome/Edge browser extension for connecting to running browser instances

### MCP Server Functionality
The Playwright MCP server provides browser automation capabilities through the Model Context Protocol:

- **Core automation tools**: click, type, navigate, take screenshots, etc.
- **Tab management**: create, close, and switch between browser tabs
- **Run artifacts**: session recording with video, HAR files, and traces organized by project/run IDs
- **Optional capabilities**: PDF generation (`--caps=pdf`), coordinate-based interactions (`--caps=vision`)
- **Multiple deployment modes**: CLI, Docker, browser extension, programmatic usage

### Run Artifacts System
The server includes a run artifacts system (`src/runArtifacts.ts`) for organized session recording:

- **Session Management**: `startRun()` creates new browser contexts with recording enabled
- **Artifact Collection**: Automatically captures video (1280x720), network HAR files, and Playwright traces
- **Organized Storage**: Files stored in `/data/{projectId}/{runId}/` structure
- **Public URLs**: Artifacts exposed via `https://videos.qabot.app/` for external access
- **Clean Finalization**: `finishRun()` properly saves and closes all recordings

### Browser Extension
The `extension/` directory contains a Chrome/Edge browser extension that allows MCP clients to connect to existing browser tabs, leveraging logged-in sessions and browser state.

### Testing Architecture
- Tests use Playwright's test framework with custom fixtures in `tests/fixtures.ts`
- Tests are organized by functionality: `core.spec.ts`, `click.spec.ts`, `capabilities.spec.ts`, etc.
- Docker testing is supported via environment variable `MCP_IN_DOCKER=1`
- Test server included at `tests/testserver/` for consistent test scenarios

### Configuration
The server supports extensive configuration via CLI arguments or JSON config files. Key configuration areas:
- Browser selection and launch options
- Network filtering (allowed/blocked origins)
- Session persistence vs isolation
- Output directory for traces, videos, and PDFs
- Capability flags for optional features

### Development Notes
- This repository primarily contains the distribution package and tests
- For core MCP server development, work in the Playwright monorepo
- The `update-readme.js` script automatically generates tool documentation in the README
- Package uses Playwright's alpha builds for latest features
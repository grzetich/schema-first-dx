# Buffer Developer Experience Kit

A proof of concept exploring what Buffer's new API developer experience could look like, designed for both human developers and AI agents from the same source of truth.

**[Live Demo →](https://buffer-devex.vercel.app)**

## What's in the kit

| Component | Description |
|-----------|-------------|
| **Annotated GraphQL Schema** | 1,100+ lines with descriptions designed for human and AI consumption |
| **Quickstart Guide** | JavaScript, Python, and curl examples. Zero to first call in 5 minutes. |
| **Error Reference** | Every error with response bodies, explanations, and fixes |
| **Workflow Patterns** | Content calendars, analytics dashboards, RSS pipelines, cross-channel publishing |
| **AI-Native Design Doc** | Why well-annotated schemas replace thick adapter layers for AI agents |
| **Thin-Bridge MCP Server** | ~250 lines. Schema introspection → MCP tools. No manual mapping. |
| **Interactive Portal** | Browse the schema, explore MCP tools, see AI code generation in action |

## The thesis

Well-designed GraphQL schema annotations are already the best documentation format for AI consumption. If the descriptions are clear and complete, an MCP server can expose the entire API as tools with minimal glue code. The bridge stays thin because the schema does the heavy lifting.

When the MCP server needs custom logic to explain a tool, that's a signal the schema description needs improvement, not that the bridge needs to be smarter.

## What was wrong with the old docs

Based on analysis of Buffer's original API documentation (2012-2019):

- **No language-specific examples** — raw HTTP only, URL-encoded POST data
- **No error documentation** — bare code table on a separate page, no response bodies
- **No workflow guidance** — isolated endpoints, no sequencing patterns
- **No webhooks** — polling only, which ate the 60 req/min rate limit budget
- **No media upload endpoint** — confusing `media[]` associative array
- **No comment management** — Community feature existed in UI but not API
- **Stale data** — Twitter 140-char limit, "favorites" instead of "likes" with a "we'll fix it" note that never shipped

## Running locally

```bash
npm install
npm run dev
```

## Deploying to Vercel

```bash
npm run build
# or just connect the repo to Vercel for automatic deploys
```

## Project structure

```
buffer-devex-portal/        # Interactive portal (this repo)
├── src/App.jsx              # Full portal application
├── index.html               # Entry point with font loading
└── vite.config.js           # Vite configuration

buffer-devex-kit/            # Schema, docs, and MCP server
├── schema/schema.graphql    # Annotated GraphQL schema
├── docs/
│   ├── quickstart.md        # Multi-language getting started guide
│   ├── errors.md            # Error reference with response bodies
│   ├── workflows.md         # Integration patterns
│   └── ai-design.md         # AI-native design rationale
├── mcp-server/index.ts      # Thin-bridge MCP server
└── demo-app/src/App.tsx     # API explorer component
```

## Context

Buffer is [rebuilding their public API](https://buffer.com/resources/rebuilding-buffers-api/) after shutting down the original REST API in 2019. This kit explores what the developer experience could look like, informed by research on how API documentation formats affect AI code generation.

Built by [Ed Grzetic](https://grzeti.ch).

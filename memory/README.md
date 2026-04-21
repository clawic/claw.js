# Memory

Typed markdown-first memory CLI for agents.

## Install

```bash
npm install
npm run build
```

## Initialize

```bash
node dist/cli.js init
```

## Create A Note Template

```bash
node dist/cli.js new entity technology --id tech_flutter --title Flutter
```

## Validate And Index

```bash
node dist/cli.js validate
node dist/cli.js index
```

## Query

```bash
node dist/cli.js query --text flutter
node dist/cli.js query --type technology --where technologyKind=framework
```

## Active Memory

```bash
node dist/cli.js save --content "User prefers local-first memory" --class semantic
node dist/cli.js capture --session work --user "Remember the inbox UI" --assistant "Captured"
node dist/cli.js promote cap_123
node dist/cli.js search --text "local memory" --semantic
node dist/cli.js context --text "What should I remember before answering?"
node dist/cli.js status
```

The local server also exposes active-memory endpoints for recall, context bundles,
capture review, timeline data, and tool-style calls.

## Test

```bash
npm run test:e2e
```

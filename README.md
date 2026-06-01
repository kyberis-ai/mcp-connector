# @kyberis-ai/mcp

CLI helper for connecting agent MCP clients to Kyberis with a one-time connect token.

```bash
npx -y @kyberis-ai/mcp connect claude --token kct_abc123
```

The command exchanges the token for a short-lived MCP bearer credential, prints the MCP URL, and emits client-specific configuration guidance for Claude, Codex, Cursor, or generic MCP clients.

## Contributing

Issues and pull requests are welcome.

When changing the connector CLI, run:

```bash
npm test
npm pack --dry-run
```

By contributing, you agree that your contributions are licensed under the Apache License 2.0.

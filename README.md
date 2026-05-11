# @kyberis/mcp

CLI helper for connecting agent MCP clients to Kyberis with a one-time connect token.

```bash
npx -y @kyberis/mcp connect claude --token kct_abc123
```

The command exchanges the token for a short-lived MCP bearer credential, prints the MCP URL, and emits client-specific configuration guidance for Claude, Codex, Cursor, or generic MCP clients.

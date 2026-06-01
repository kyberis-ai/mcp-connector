# @kyberis-ai/mcp

CLI helper for connecting agent MCP clients to Kyberis with a one-time connect token.

```bash
npx -y @kyberis-ai/mcp connect windsurf --token kct_abc123
```

The command exchanges the token for a short-lived MCP bearer credential and configures the selected MCP client by default. Use `--dry-run` or `-n` to print the configuration guidance without changing local client config. Use `--json` to print machine-readable connection details without changing local client config.

Default configuration targets:

- Claude: runs `claude mcp add --transport http kyberis ...`
- Codex: updates `~/.codex/config.toml`
- Cursor: updates `~/.cursor/mcp.json`
- Windsurf: updates `~/.codeium/windsurf/mcp_config.json`
- Generic: no default install target; use `--dry-run` and copy the JSON into your client

## Contributing

Issues and pull requests are welcome.

When changing the connector CLI, run:

```bash
npm test
npm pack --dry-run
```

By contributing, you agree that your contributions are licensed under the Apache License 2.0.

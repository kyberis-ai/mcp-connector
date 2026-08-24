# @kyberis-ai/mcp

CLI helper for connecting agent MCP clients to Kyberis with a one-time connect token.

```bash
npx -y @kyberis-ai/mcp connect windsurf --token kct_abc123
```

The command exchanges the token for an MCP connection credential and configures
the selected MCP client by default. Kyberis creates or selects an API key for the
MCP connection. When setup returns that key's secret, the CLI installs direct
API-key auth as `Authorization: ApiKey <id>:<secret>`.

Older exchange responses may not include an API key secret. In that case the CLI
installs a legacy bearer fallback for the MCP client and prints the API key ID,
not an API key secret. The secret is not retrievable later, so that key cannot
be copied into direct REST API calls.

Use `--print-config` or `--manual` to print manual installation guidance without
changing local client config. `--dry-run` and `-n` remain aliases for
compatibility. These modes still exchange and spend the one-time connect token,
register the MCP client, and create server-side credentials; they only skip
local client configuration changes.

Use `--json` to print machine-readable connection details without changing local
client config. It also exchanges and spends the connect token. The JSON includes
`setup_exchange_effects` so automation can tell that server-side setup occurred.
`auth_mode: "api_key"` is the normal direct API-key path, and
`auth_mode: "bearer_fallback"` means the server returned only a legacy bearer
credential.

The connect token is only a one-time setup credential. After exchange, Kyberis
creates an MCP connection and binds it to a durable API key. That API key's
scopes control which MCP tools can call Kyberis. If a tool returns
`insufficient_scope`, check `missing_scopes` in the error response, update or
create an API key with those scopes, then rebind or reconnect the MCP client so
it receives fresh runtime credentials.

For direct REST API access outside MCP, create a separate API key in the Kyberis
dashboard and save its secret when it is shown. Editing an API key later does
not show the secret again.

Default configuration targets:

- Claude: runs `claude mcp add --scope local --transport http kyberis ... --header "Authorization: ..."`
- Codex: updates `~/.codex/config.toml` with a Kyberis HTTP MCP server and `Authorization` header
- Cursor: updates `~/.cursor/mcp.json` with a Kyberis HTTP MCP server and `Authorization` header
- Windsurf: updates `~/.codeium/windsurf/mcp_config.json` with a Kyberis HTTP MCP server and `Authorization` header
- Generic: no default install target; use `--print-config` and copy the JSON into your client

Claude Code scopes:

- `local`: current project directory only. This is the connector default.
- `user`: all Claude Code projects for the current OS user.
- `project`: shared project configuration. Use only when you intentionally want
  to share the MCP server entry, and do not commit API keys, bearer tokens, or
  other secrets.

## Contributing

Issues and pull requests are welcome.

When changing the connector CLI, run:

```bash
npm test
npm pack --dry-run
```

By contributing, you agree that your contributions are licensed under the Apache License 2.0.

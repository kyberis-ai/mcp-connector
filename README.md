# @kyberis-ai/mcp

CLI helper for connecting agent MCP clients to Kyberis with a one-time connect token.

```bash
npx -y @kyberis-ai/mcp connect windsurf --token kct_abc123
```

The command exchanges the token for an MCP connection credential and configures
the selected MCP client by default. Kyberis creates or selects an API key for the
MCP connection, but the setup response may only return a short-lived bearer
token for the MCP client. In that case the CLI prints the API key ID, not an API
key secret. The secret is not retrievable later, so that key cannot be copied
into direct REST API calls as `Authorization: ApiKey <id>:<secret>`.

Use `--dry-run` or `-n` to print configuration guidance without changing local
client config. Use `--json` to print machine-readable connection details without
changing local client config; check `api_key_secret_retrievable` before treating
the API key as a direct REST credential.

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
- Generic: no default install target; use `--dry-run` and copy the JSON into your client

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

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientConfiguration,
  createAgentIdentity,
  errorMessageForExchangeFailure,
  exchangeConnectToken,
  parseArgs,
} from "../src/cli.mjs";

const TOKEN = "kct_abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_";

test("parseArgs accepts connect token command", () => {
  const args = parseArgs(["connect", "claude", "--token", TOKEN, "--api-url", "https://api.example.com"]);
  assert.equal(args.command, "connect");
  assert.equal(args.client, "claude");
  assert.equal(args.token, TOKEN);
  assert.equal(args.apiUrl, "https://api.example.com");
});

test("parseArgs rejects unsupported client", () => {
  assert.throws(
    () => parseArgs(["connect", "unknown", "--token", TOKEN]),
    /Unsupported MCP client/
  );
});

test("createAgentIdentity creates valid shell-safe id and useful label", () => {
  const identity = createAgentIdentity("cursor", { agentLabel: "Dev Laptop Cursor" });
  assert.match(identity.agentId, /^kag_[A-Za-z0-9_-]{16,}$/);
  assert.equal(identity.label, "Dev Laptop Cursor");
});

test("exchangeConnectToken posts normalized payload", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      mcp_url: "https://mcp.example.com/mcp",
      agent_id: "kag_testagent_1234567890",
      agent_type: "claude",
      api_key_id: "api-key-1",
      connection_key_type: "agent_id",
      connection_key: "kag_testagent_1234567890",
      oidc_fallback_bound: false,
      auth: {
        token_type: "Bearer",
        access_token: "bearer-token",
        expires_in: 1209600,
      },
    }), { status: 200 });
  };

  const result = await exchangeConnectToken({
    client: "claude",
    token: TOKEN,
    apiUrl: "https://api.example.com/",
    agentId: "kag_abcdefghijklmnop",
    agentLabel: "Test Claude",
  }, fetchImpl);

  assert.equal(calls[0].url, "https://api.example.com/api/v2/mcp/connect-tokens/exchange");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    connect_token: TOKEN,
    agent_type: "claude",
    agent_id: "kag_abcdefghijklmnop",
    agent_label: "Test Claude",
  });
  assert.equal(result.response.api_key_id, "api-key-1");
});

test("exchangeConnectToken maps expired token error", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: "connect_token_expired" }), { status: 410 });
  await assert.rejects(
    () => exchangeConnectToken({ client: "claude", token: TOKEN, apiUrl: "https://api.example.com" }, fetchImpl),
    /expired/
  );
});

test("error messages cover replay and wrong-client cases", () => {
  assert.match(errorMessageForExchangeFailure(410, { error: "connect_token_used" }), /already used/);
  assert.match(errorMessageForExchangeFailure(400, { error: "connect_token_wrong_client" }), /different MCP client/);
});

test("buildClientConfiguration emits client snippets", () => {
  const config = buildClientConfiguration({
    response: {
      mcp_url: "https://mcp.example.com/mcp",
      agent_id: "kag_abcdefghijklmnop",
      api_key_id: "api-key-1",
      auth: {
        access_token: "bearer-token",
        expires_in: 1209600,
      },
    },
  });
  assert.equal(config.generic.mcpServers.kyberis.url, "https://mcp.example.com/mcp");
  assert.equal(config.generic.mcpServers.kyberis.headers.Authorization, "Bearer bearer-token");
  assert.match(config.claude.command, /claude mcp add/);
  assert.match(config.codex.toml, /mcp_servers\.kyberis/);
});

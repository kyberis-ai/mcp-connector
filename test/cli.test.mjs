import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildClientConfiguration,
  createAgentIdentity,
  errorMessageForExchangeFailure,
  exchangeConnectToken,
  formatInstallSuccess,
  formatSuccess,
  installClientConfiguration,
  installJsonMcpConfig,
  parseArgs,
  upsertCodexMcpBlock,
} from "../src/cli.mjs";

const TOKEN = "kct_abcdefghijklmnopqrstuvwxyzABCDEF0123456789-_";

function testConfig() {
  return buildClientConfiguration({
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
}

test("parseArgs accepts connect token command", () => {
  const args = parseArgs(["connect", "windsurf", "--token", TOKEN, "--api-url", "https://api.example.com"]);
  assert.equal(args.command, "connect");
  assert.equal(args.client, "windsurf");
  assert.equal(args.token, TOKEN);
  assert.equal(args.apiUrl, "https://api.example.com");
});

test("parseArgs accepts dry-run shorthand", () => {
  const args = parseArgs(["connect", "windsurf", "--token", TOKEN, "-n"]);
  assert.equal(args.dryRun, true);
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

  assert.equal(calls[0].url, "https://api.example.com/v2/mcp/connect-tokens/exchange");
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
  assert.equal(config.windsurf.mcpServers.kyberis.url, "https://mcp.example.com/mcp");
  assert.match(config.claude.command, /claude mcp add/);
  assert.match(config.codex.toml, /mcp_servers\.kyberis/);
});

test("formatSuccess emits Windsurf MCP config guidance", () => {
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
  const output = formatSuccess("windsurf", config);
  assert.match(output, /Windsurf Cascade MCP config/);
  assert.match(output, /\.codeium\/windsurf\/mcp_config\.json/);
  assert.match(output, /"url": "https:\/\/mcp.example.com\/mcp"/);
});

test("installClientConfiguration merges Windsurf MCP config", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyberis-mcp-test-"));
  const configPath = path.join(homeDir, ".codeium", "windsurf", "mcp_config.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { existing: { command: "node" } }, other: true }, null, 2));

  const result = installClientConfiguration("windsurf", testConfig(), { homeDir });
  const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));

  assert.equal(result.path, configPath);
  assert.equal(saved.other, true);
  assert.deepEqual(saved.mcpServers.existing, { command: "node" });
  assert.equal(saved.mcpServers.kyberis.url, "https://mcp.example.com/mcp");
  assert.equal(saved.mcpServers.kyberis.headers.Authorization, "Bearer bearer-token");
});

test("installJsonMcpConfig replaces existing Kyberis config", () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "kyberis-mcp-test-"));
  const configPath = path.join(homeDir, "mcp.json");
  fs.writeFileSync(configPath, JSON.stringify({
    mcpServers: {
      existing: { command: "node" },
      kyberis: {
        type: "http",
        url: "https://old.example.com/mcp",
        headers: { Authorization: "Bearer old-token" },
      },
    },
    other: true,
  }, null, 2));

  installJsonMcpConfig(configPath, testConfig().cursor);
  const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));

  assert.equal(saved.other, true);
  assert.deepEqual(saved.mcpServers.existing, { command: "node" });
  assert.equal(Object.keys(saved.mcpServers).filter((name) => name === "kyberis").length, 1);
  assert.equal(saved.mcpServers.kyberis.url, "https://mcp.example.com/mcp");
  assert.equal(saved.mcpServers.kyberis.headers.Authorization, "Bearer bearer-token");
});

test("upsertCodexMcpBlock replaces existing Kyberis block", () => {
  const existing = "[project]\nname = \"demo\"\n\n[mcp_servers.kyberis]\nurl = \"old\"\n\n[mcp_servers.other]\nurl = \"other\"\n";
  const updated = upsertCodexMcpBlock(existing, testConfig().codex.toml);

  assert.match(updated, /\[project\]/);
  assert.match(updated, /url = "https:\/\/mcp.example.com\/mcp"/);
  assert.doesNotMatch(updated, /url = "old"/);
  assert.match(updated, /\[mcp_servers.other\]/);
});

test("upsertCodexMcpBlock replaces spaced CRLF Kyberis block", () => {
  const existing = "[project]\r\nname = \"demo\"\r\n\r\n  [mcp_servers.kyberis]  \r\nurl = \"https://mcp.example.com/mcp\"\r\nheaders = { Authorization = \"Bearer bearer-token\" }\r\n\r\n[mcp_servers.other]\r\nurl = \"other\"\r\n";
  const updated = upsertCodexMcpBlock(existing, testConfig().codex.toml);

  assert.equal((updated.match(/\[mcp_servers\.kyberis\]/g) || []).length, 1);
  assert.equal((updated.match(/headers =/g) || []).length, 1);
  assert.match(updated, /url = "https:\/\/mcp.example.com\/mcp"/);
  assert.match(updated, /\[mcp_servers.other\]/);
});

test("installClientConfiguration invokes Claude CLI idempotently", () => {
  const calls = [];
  const result = installClientConfiguration("claude", testConfig(), {
    spawnSync: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: calls.length === 1 ? 1 : 0, stdout: "", stderr: "No project-local MCP server found with name: kyberis" };
    },
  });

  assert.equal(calls[0].command, "claude");
  assert.deepEqual(calls[0].args, ["mcp", "remove", "--scope", "local", "kyberis"]);
  assert.deepEqual(calls[1].args.slice(0, 7), ["mcp", "add", "--scope", "local", "--transport", "http", "kyberis"]);
  assert.ok(calls[1].args.includes("Authorization: Bearer bearer-token"));
  assert.equal(result.type, "command");
});

test("formatInstallSuccess reports updated config file", () => {
  const output = formatInstallSuccess("windsurf", testConfig(), { type: "file", path: "/tmp/mcp_config.json" });
  assert.match(output, /connection installed/);
  assert.match(output, /Updated \/tmp\/mcp_config\.json/);
});

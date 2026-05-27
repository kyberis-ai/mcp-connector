import crypto from "node:crypto";
import os from "node:os";

const DEFAULT_API_URL = "https://api.kyberis.ai";
const CONNECT_TOKEN_RE = /^kct_[A-Za-z0-9_-]{32,}$/;
const AGENT_ID_RE = /^kag_[A-Za-z0-9_-]{16,}$/;
const CLIENT_RE = /^[A-Za-z0-9._-]{1,64}$/;
const SUPPORTED_CLIENTS = new Set(["claude", "codex", "cursor", "generic"]);

function usage() {
  return `Usage:
  kyberis-mcp connect <claude|codex|cursor|generic> --token <kct_...> [options]

Options:
  --api-url <url>       Kyberis API base URL. Defaults to ${DEFAULT_API_URL}
  --agent-label <text>  Display label for this agent connection
  --agent-id <id>       Existing agent id, mainly for tests or repair flows
  --json                Print machine-readable JSON only
  -h, --help            Show this help
`;
}

export function parseArgs(argv) {
  const args = [...argv];
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    return { command: "help" };
  }
  const command = args.shift();
  if (command !== "connect") {
    throw new Error(`Unknown command '${command}'.\n${usage()}`);
  }
  const client = normalizeClient(args.shift());
  const out = {
    command,
    client,
    token: "",
    apiUrl: process.env.KYBERIS_API_URL || DEFAULT_API_URL,
    agentLabel: "",
    agentId: "",
    json: false,
  };
  while (args.length) {
    const key = args.shift();
    if (key === "--token" || key === "--connect-token") {
      out.token = String(args.shift() || "").trim();
    } else if (key === "--api-url") {
      out.apiUrl = String(args.shift() || "").trim();
    } else if (key === "--agent-label" || key === "--label") {
      out.agentLabel = String(args.shift() || "").trim();
    } else if (key === "--agent-id") {
      out.agentId = String(args.shift() || "").trim();
    } else if (key === "--json") {
      out.json = true;
    } else {
      throw new Error(`Unknown option '${key}'.\n${usage()}`);
    }
  }
  validateConnectArgs(out);
  return out;
}

function normalizeClient(value) {
  const client = String(value || "").trim().toLowerCase();
  if (!client) {
    throw new Error(`Missing MCP client.\n${usage()}`);
  }
  if (!CLIENT_RE.test(client)) {
    throw new Error("Invalid MCP client name.");
  }
  if (!SUPPORTED_CLIENTS.has(client)) {
    throw new Error(`Unsupported MCP client '${client}'. Use claude, codex, cursor, or generic.`);
  }
  return client;
}

function validateConnectArgs(args) {
  if (!CONNECT_TOKEN_RE.test(args.token)) {
    throw new Error("Invalid connect token. Expected a shell-safe token beginning with kct_.");
  }
  if (!args.apiUrl || !/^https?:\/\//i.test(args.apiUrl)) {
    throw new Error("--api-url must be an absolute http(s) URL.");
  }
  if (args.agentId && !AGENT_ID_RE.test(args.agentId)) {
    throw new Error("--agent-id must begin with kag_ and contain at least 16 shell-safe characters.");
  }
}

export function createAgentIdentity(client, options = {}) {
  const username = envFirst(["USER", "USERNAME", "LOGNAME"]) || os.userInfo().username || "user";
  const host = envFirst(["HOSTNAME", "COMPUTERNAME"]) || os.hostname() || "host";
  const platform = os.platform();
  const random = crypto.randomBytes(8).toString("base64url");
  const stableBase = `${username}@${host}:${platform}:${client}`;
  const fingerprint = crypto.createHash("sha256").update(stableBase).digest("base64url").slice(0, 18);
  const agentId = options.agentId || `kag_${fingerprint}_${random}`;
  const label = options.agentLabel || `${username}@${host} ${client} ${random.slice(0, 6)}`;
  return { agentId, label };
}

function envFirst(names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

export async function exchangeConnectToken(args, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available. Use Node.js 20 or newer.");
  }
  const identity = createAgentIdentity(args.client, {
    agentId: args.agentId,
    agentLabel: args.agentLabel,
  });
  const endpoint = `${String(args.apiUrl).replace(/\/+$/, "")}/v2/mcp/connect-tokens/exchange`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      connect_token: args.token,
      agent_type: args.client,
      agent_id: identity.agentId,
      agent_label: identity.label,
    }),
  });
  const body = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(errorMessageForExchangeFailure(response.status, body));
  }
  return { endpoint, identity, response: body };
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

export function errorMessageForExchangeFailure(status, body) {
  const code = String(body?.error || "").trim();
  const messages = {
    invalid_connect_token: "The connect token is malformed. Generate a new setup command from Kyberis.",
    invalid_agent_id: "The generated agent id was rejected. Retry the command or pass a valid --agent-id.",
    invalid_agent_type: "The MCP client type is invalid. Use claude, codex, cursor, or generic.",
    connect_token_not_found: "The connect token was not found. Generate a new setup command from Kyberis.",
    connect_token_used: "This connect token was already used. Generate a new setup command from Kyberis.",
    connect_token_revoked: "This connect token was revoked. Generate a new setup command from Kyberis.",
    connect_token_expired: "This connect token expired. Generate a new setup command from Kyberis.",
    connect_token_wrong_client: "This token was created for a different MCP client. Generate a command for this client in Kyberis.",
  };
  return messages[code] || `Kyberis connect-token exchange failed (${status}${code ? ` ${code}` : ""}).`;
}

export function buildClientConfiguration(exchangeResponse) {
  const result = exchangeResponse.response || exchangeResponse;
  const bearer = result?.auth?.access_token;
  const mcpUrl = result?.mcp_url;
  const agentId = result?.agent_id;
  if (!bearer || !mcpUrl) {
    throw new Error("Kyberis exchange response did not include MCP URL and bearer token.");
  }
  const jsonConfig = {
    mcpServers: {
      kyberis: {
        type: "http",
        url: mcpUrl,
        headers: {
          Authorization: `Bearer ${bearer}`,
        },
      },
    },
  };
  return {
    agent_id: agentId,
    mcp_url: mcpUrl,
    api_key_id: result.api_key_id,
    expires_in: result.auth.expires_in,
    bearer_token: bearer,
    generic: jsonConfig,
    cursor: jsonConfig,
    claude: {
      command: `claude mcp add --transport http kyberis ${shellQuote(mcpUrl)} --header ${shellQuote(`Authorization: Bearer ${bearer}`)}`,
      config: jsonConfig,
    },
    codex: {
      toml: `[mcp_servers.kyberis]\nurl = ${tomlString(mcpUrl)}\nheaders = { Authorization = ${tomlString(`Bearer ${bearer}`)} }\n`,
    },
  };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

export function formatSuccess(client, config) {
  if (client === "claude") {
    return `Kyberis MCP connection ready.\n\nAgent ID: ${config.agent_id}\nMCP URL: ${config.mcp_url}\nAPI Key: ${config.api_key_id}\n\nRun this Claude command if the CLI did not install it automatically:\n${config.claude.command}\n`;
  }
  if (client === "codex") {
    return `Kyberis MCP connection ready.\n\nAgent ID: ${config.agent_id}\nMCP URL: ${config.mcp_url}\nAPI Key: ${config.api_key_id}\n\nAdd this to your Codex MCP config:\n${config.codex.toml}`;
  }
  if (client === "cursor") {
    return `Kyberis MCP connection ready.\n\nAgent ID: ${config.agent_id}\nMCP URL: ${config.mcp_url}\nAPI Key: ${config.api_key_id}\n\nCursor MCP JSON:\n${JSON.stringify(config.cursor, null, 2)}\n`;
  }
  return `Kyberis MCP connection ready.\n\nAgent ID: ${config.agent_id}\nMCP URL: ${config.mcp_url}\nAPI Key: ${config.api_key_id}\n\nGeneric MCP JSON:\n${JSON.stringify(config.generic, null, 2)}\n`;
}

export async function main(argv) {
  const args = parseArgs(argv);
  if (args.command === "help") {
    console.log(usage());
    return;
  }
  const exchanged = await exchangeConnectToken(args);
  const config = buildClientConfiguration(exchanged);
  if (args.json) {
    console.log(JSON.stringify({ client: args.client, ...config }, null, 2));
    return;
  }
  console.log(formatSuccess(args.client, config));
}

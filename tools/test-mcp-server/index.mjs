#!/usr/bin/env node
/**
 * A dependency-free MCP server used to prove the assistant's MCP wiring end to end.
 *
 * It speaks JSON-RPC 2.0 over stdio with newline-delimited messages, which is what the MCP stdio
 * transport uses. Avoiding @modelcontextprotocol/sdk keeps this runnable straight from a checkout
 * with no install step, so a failure here is unambiguously the integration rather than the deps.
 *
 * Register it in ~/.config/opencode/opencode.jsonc:
 *   "mcp": { "capybara-test": { "type": "local", "command": ["node", "<abs path>/index.mjs"] } }
 *
 * Everything is written to stdout; stderr is left free for logging, because anything printed on
 * stdout that is not a JSON-RPC message corrupts the stream.
 */

const PROTOCOL_VERSION = "2025-03-26";

const TOOLS = [
  {
    name: "capybara_ping",
    description:
      "Health check for the Capybara test MCP server. Use it to confirm the MCP transport is " +
      "working before blaming a tool for something the connection is doing. Takes an optional " +
      "message and echoes it back. Returns text of the form 'pong: <message> (<ISO timestamp>)'.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Text to echo back. Defaults to 'ping'." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "capybara_add",
    description:
      "Adds two numbers. Exists so a tool call with real arguments and a computed result can be " +
      "verified, not just a constant echo. Args: a (number), b (number). Returns text '<a> + <b> = <sum>'.",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number", description: "First addend." },
        b: { type: "number", description: "Second addend." },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
  },
  {
    name: "capybara_env",
    description:
      "Reports the server's own runtime: node version, working directory, and platform. Use it to " +
      "check that `cwd` and `environment` from the MCP config actually reached the process. " +
      "Returns a JSON object { node, cwd, platform, pid }.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const text = (value) => ({ content: [{ type: "text", text: value }] });

function callTool(name, args) {
  if (name === "capybara_ping") {
    return text(`pong: ${args?.message ?? "ping"} (${new Date().toISOString()})`);
  }
  if (name === "capybara_add") {
    const { a, b } = args ?? {};
    if (typeof a !== "number" || typeof b !== "number") {
      // isError keeps this a tool-level failure the model can read and retry, rather than a
      // protocol error that would surface as the whole server misbehaving.
      return { ...text("capybara_add requires two numbers, a and b."), isError: true };
    }
    return text(`${a} + ${b} = ${a + b}`);
  }
  if (name === "capybara_env") {
    return text(JSON.stringify({
      cwd: process.cwd(),
      node: process.version,
      pid: process.pid,
      platform: process.platform,
    }, null, 2));
  }
  return { ...text(`Unknown tool: ${name}`), isError: true };
}

function handle(request) {
  const { id, method, params } = request;
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "capybara-test", version: "1.0.0" },
      };
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call":
      return callTool(params?.name, params?.arguments);
    case "ping":
      return {};
    default:
      // Signalled by returning undefined so the caller can answer with a JSON-RPC error.
      return undefined;
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue; // A partial or malformed frame is not worth tearing the connection down for.
    }

    // Notifications carry no id and must never be answered — replying to one is a protocol error.
    if (request.id === undefined || request.id === null) continue;

    let result;
    try {
      result = handle(request);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32603, message: String(error?.message ?? error) },
      })}\n`);
      continue;
    }

    const response = result === undefined
      ? { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } }
      : { jsonrpc: "2.0", id: request.id, result };
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
});

process.stdin.on("end", () => process.exit(0));

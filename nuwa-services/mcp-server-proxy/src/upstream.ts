import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { UpstreamConfig, AuthConfig, Upstream } from "./types.js";

function buildHeaders(auth?: AuthConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!auth) return headers;

  switch (auth.scheme) {
    case "header":
      headers[auth.header] = auth.value;
      break;
    case "basic":
      headers["Authorization"] =
        "Basic " +
        Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
      break;
    case "bearer":
      headers["Authorization"] = `Bearer ${auth.token}`;
      break;
  }
  return headers;
}

export async function initUpstream(
  name: string,
  cfg: UpstreamConfig,
): Promise<Upstream> {
  let transport: any;
  if (cfg.type === "httpStream" || cfg.type === "http") {
    transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers: buildHeaders(cfg.auth) },
    } as any);
  } else {
    // cfg here is StdioUpstreamConfig
    const stdioCfg = cfg as any; // type cast for clarity
    transport = new StdioClientTransport({
      command: stdioCfg.command[0],
      args: stdioCfg.command.slice(1),
      cwd: stdioCfg.cwd,
      env: stdioCfg.env,
    });
  }

  const client: any = new Client(
    { name: `proxy-${name}`, version: "0.1.0" },
    {},
  );
  await client.connect(transport);

  // Fetch capabilities after connect using getServerCapabilities
  let capabilities: ServerCapabilities = {};
  try {
    if (typeof client.getServerCapabilities === "function") {
      capabilities = await client.getServerCapabilities();
    }
  } catch (e) {
    console.warn(`Upstream ${name} getServerCapabilities failed:`, e);
  }

  return { type: cfg.type, client, config: cfg, capabilities };
}

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

export async function initUpstream(cfg: UpstreamConfig): Promise<Upstream> {
  console.log(`🔗 Initializing upstream with type: ${cfg.type}`);

  let transport: any;
  if (cfg.type === "httpStream" || cfg.type === "http") {
    const authInfo = cfg.auth
      ? `${cfg.auth.scheme} authentication`
      : "no authentication";
    console.log(`   URL: ${cfg.url}`);
    console.log(`   Auth: ${authInfo}`);
    const headers = buildHeaders(cfg.auth);
    console.log(`   Headers: ${Object.keys(headers).join(", ")}`);
    transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers },
    } as any);
  } else {
    // cfg here is StdioUpstreamConfig
    const stdioCfg = cfg as any; // type cast for clarity
    console.log(`   Command: ${stdioCfg.command.join(" ")}`);
    if (stdioCfg.cwd) {
      console.log(`   Working Directory: ${stdioCfg.cwd}`);
    }
    
    // Merge parent process environment with custom environment variables
    const mergedEnv = {
      ...Object.fromEntries(
        Object.entries(process.env)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, v as string])
      ),
      ...(stdioCfg.env || {}),
    };
    
    const inheritedEnvCount = Object.keys(process.env).filter(([_, v]) => v !== undefined).length;
    const customEnvCount = Object.keys(stdioCfg.env || {}).length;
    console.log(`   Environment: ${inheritedEnvCount} inherited + ${customEnvCount} custom variables`);
    if (stdioCfg.env && Object.keys(stdioCfg.env).length > 0) {
      console.log(`   Custom Variables: ${Object.keys(stdioCfg.env).join(", ")}`);
    }

    // Configure stderr handling
    const stderrConfig = stdioCfg.stderr || 'inherit';
    console.log(`   Stderr: ${stderrConfig} (child process errors will ${stderrConfig === 'inherit' ? 'be visible' : stderrConfig === 'ignore' ? 'be suppressed' : 'be captured'})`);

    transport = new StdioClientTransport({
      command: stdioCfg.command[0],
      args: stdioCfg.command.slice(1),
      cwd: stdioCfg.cwd,
      env: mergedEnv,
      stderr: stderrConfig,
    });
  }

  const client: any = new Client(
    { name: "mcp-proxy-client", version: "0.1.0" },
    {},
  );

  try {
    await client.connect(transport);
    console.log(`✅ Successfully connected to upstream`);
  } catch (e) {
    console.error(`❌ Failed to connect to upstream:`, e);
    throw e;
  }

  // Fetch capabilities after connect using getServerCapabilities
  let capabilities: ServerCapabilities = {};
  try {
    if (typeof client.getServerCapabilities === "function") {
      capabilities = await client.getServerCapabilities();
      console.log(
        `📋 Retrieved capabilities from upstream:`,
        Object.keys(capabilities),
      );
    }
  } catch (e) {
    console.warn(`⚠️  Upstream getServerCapabilities failed:`, e);
  }

  console.log(`🎯 Upstream initialization completed`);
  return { type: cfg.type, client, config: cfg, capabilities };
}

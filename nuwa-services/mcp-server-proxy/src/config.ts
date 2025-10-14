/**
 * Configuration loading and parsing module
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { UpstreamConfig } from "./types.js";

// Get directory name in ESM
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Tool configuration interface - only for pricing configuration
export interface MinimalToolConfig {
  name: string;
  pricePicoUSD?: string;
}

// Main configuration interface
export interface MinimalConfig {
  port: number;
  endpoint: string;
  // Payment configuration (optional)
  serviceId?: string;
  serviceKey?: string;
  network?: "local" | "dev" | "test" | "main";
  rpcUrl?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string;
  adminDid?: string[];
  debug?: boolean;
  // Upstream MCP server configuration
  upstream?: UpstreamConfig;
  // Custom tools registration
  register?: {
    tools: MinimalToolConfig[];
  };
}

// Command line argument definitions
interface CliArgs {
  port?: number;
  endpoint?: string;
  config?: string;
  serviceId?: string;
  network?: string;
  rpcUrl?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string;
  debug?: boolean;
  help?: boolean;
}

// Parse command line arguments
function parseCliArgs(): CliArgs {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        port: { type: "string", short: "p" },
        endpoint: { type: "string", short: "e" },
        config: { type: "string", short: "c" },
        "service-id": { type: "string" },
        network: { type: "string", short: "n" },
        "rpc-url": { type: "string" },
        "default-asset-id": { type: "string" },
        "default-price-pico-usd": { type: "string" },
        debug: { type: "boolean", short: "d" },
        help: { type: "boolean", short: "h" },
      },
      allowPositional: false,
    });

    return {
      port: values.port ? Number(values.port) : undefined,
      endpoint: values.endpoint,
      config: values.config,
      serviceId: values["service-id"],
      network: values.network,
      rpcUrl: values["rpc-url"],
      defaultAssetId: values["default-asset-id"],
      defaultPricePicoUSD: values["default-price-pico-usd"],
      debug: values.debug,
      help: values.help,
    };
  } catch (error) {
    console.error("Error parsing command line arguments:", error);
    process.exit(1);
  }
}

// Show help message
export function showHelp() {
  console.log(`
MCP Server Proxy (Single Upstream) - v2

Usage: node server.js [options]

Options:
  -p, --port <number>                 Server port (default: 8088)
  -e, --endpoint <string>             MCP endpoint path (default: /mcp)
  -c, --config <path>                 Config file path (default: config.yaml)
      --service-id <string>           Payment service ID
  -n, --network <string>              Network (local|dev|test|main)
      --rpc-url <url>                 Rooch RPC URL
      --default-asset-id <string>     Default asset ID
      --default-price-pico-usd <num>  Default price in picoUSD
  -d, --debug                         Enable debug logging
  -h, --help                          Show this help message

Configuration Priority (high to low):
  1. Command line arguments
  2. Environment variables
  3. Configuration file
  4. Default values

Environment Variables:
  PORT, CONFIG_PATH, SERVICE_ID, SERVICE_KEY,
  ROOCH_NETWORK, ROOCH_RPC_URL, DEFAULT_ASSET_ID, DEFAULT_PRICE_PICO_USD, DEBUG

Examples:
  node server.js --port 3000 --debug
  node server.js --config ./my-config.yaml
  node server.js --service-id my-service --network test --default-price-pico-usd 1000000000000
`);
}

// Load configuration file with environment variable substitution
function loadConfigFile(configPath: string): any {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const configYaml = fs.readFileSync(configPath, "utf8");
    const missingVars: string[] = [];

    const configWithEnvVars = configYaml.replace(
      /\${([^}]+)}/g,
      (match, varName) => {
        const value = process.env[varName];
        if (value === undefined || value === "") {
          missingVars.push(varName);
          return ""; // Keep empty string for now, but track missing vars
        }
        return value;
      },
    );

    // Warn about missing environment variables
    if (missingVars.length > 0) {
      console.warn(
        `⚠️  Warning: Missing environment variables in config file ${configPath}:`,
      );
      missingVars.forEach((varName) => {
        console.warn(`   - ${varName} (referenced as \${${varName}})`);
      });
      console.warn(
        "   These variables will be treated as empty strings, which may cause runtime errors.",
      );
    }

    return yaml.load(configWithEnvVars) as any;
  } catch (error) {
    console.error(`Error loading config file ${configPath}:`, error);
    process.exit(1);
  }
}

// Load configuration with priority: CLI args > env vars > config file > defaults
export function loadConfig(): MinimalConfig {
  const cliArgs = parseCliArgs();

  // Show help if requested
  if (cliArgs.help) {
    showHelp();
    process.exit(0);
  }

  // Determine config file path (CLI > env > default)
  const configPath =
    cliArgs.config ||
    process.env.CONFIG_PATH ||
    path.join(__dirname, "../config.yaml");

  // Load config file if it exists
  const fileConfig = loadConfigFile(configPath);

  // If config file was explicitly specified but doesn't exist, error
  if (cliArgs.config && !fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  // Apply configuration priority: CLI > env > file > defaults
  const config: MinimalConfig = {
    // Server settings
    port:
      cliArgs.port ??
      (process.env.PORT ? Number(process.env.PORT) : undefined) ??
      fileConfig.port ??
      8088,

    endpoint:
      cliArgs.endpoint ?? process.env.ENDPOINT ?? fileConfig.endpoint ?? "/mcp",

    // Upstream settings
    upstream: fileConfig.upstream,

    // Payment settings
    serviceId:
      cliArgs.serviceId ?? process.env.SERVICE_ID ?? fileConfig.serviceId,

    serviceKey: process.env.SERVICE_KEY ?? fileConfig.serviceKey,

    network: (cliArgs.network ??
      process.env.ROOCH_NETWORK ??
      fileConfig.network ??
      "test") as any,

    rpcUrl: cliArgs.rpcUrl ?? process.env.ROOCH_RPC_URL ?? fileConfig.rpcUrl,

    defaultAssetId:
      cliArgs.defaultAssetId ??
      process.env.DEFAULT_ASSET_ID ??
      fileConfig.defaultAssetId,

    defaultPricePicoUSD:
      cliArgs.defaultPricePicoUSD ??
      process.env.DEFAULT_PRICE_PICO_USD ??
      fileConfig.defaultPricePicoUSD,

    adminDid: fileConfig.adminDid,

    debug:
      cliArgs.debug ??
      (process.env.DEBUG === "1" || process.env.DEBUG === "true"
        ? true
        : undefined) ??
      fileConfig.debug ??
      false,

    // Tools from config file only (not suitable for CLI)
    register: {
      tools: fileConfig.register?.tools || [],
    },
  };

  return config;
}

/**
 * Configuration loading and parsing module
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import type { GatewayConfig } from "./types.js";

// Get directory name in ESM
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Command line argument definitions
interface CliArgs {
  port?: number;
  config?: string;
  baseDomain?: string;
  debug?: boolean;
  help?: boolean;
}

// Parse command line arguments
function parseCliArgs(): CliArgs | never {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        port: { type: "string", short: "p" },
        config: { type: "string", short: "c" },
        "base-domain": { type: "string" },
        debug: { type: "boolean", short: "d" },
        help: { type: "boolean", short: "h" },
      },
      allowPositional: false,
    });

    return {
      port: values.port ? Number(values.port) : undefined,
      config: values.config,
      baseDomain: values["base-domain"],
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
MCP Gateway Service

Usage: node server.js [options]

Options:
  -p, --port <number>           Gateway server port (default: 8080)
  -c, --config <path>           Config file path (default: config.yaml)
      --base-domain <domain>    Base domain (e.g., mcpproxy.xyz)
  -d, --debug                   Enable debug logging
  -h, --help                    Show this help message

Configuration Priority (high to low):
  1. Command line arguments
  2. Environment variables
  3. Configuration file
  4. Default values

Environment Variables:
  PORT, CONFIG_PATH, BASE_DOMAIN, DEBUG

Examples:
  node server.js --port 3000 --debug
  node server.js --config ./my-config.yaml
  node server.js --base-domain mcpproxy.xyz
`);
}

// Load configuration file with environment variable substitution
function loadConfigFile(configPath: string): any {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const configYaml = fs.readFileSync(configPath, "utf8");
    const configWithEnvVars = configYaml.replace(
      /\${([^}]+)}/g,
      (_: string, varName: string) => {
        return process.env[varName] || "";
      },
    );
    return yaml.load(configWithEnvVars) as any;
  } catch (error) {
    console.error(`Error loading config file ${configPath}:`, error);
    process.exit(1);
  }
}

// Load configuration with priority: CLI args > env vars > config file > defaults
export function loadConfig(): GatewayConfig {
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
  const config: GatewayConfig = {
    // Server settings
    port:
      cliArgs.port ??
      (process.env.PORT ? Number(process.env.PORT) : undefined) ??
      fileConfig.port ??
      8080,

    baseDomain:
      cliArgs.baseDomain ??
      process.env.BASE_DOMAIN ??
      fileConfig.baseDomain ??
      "mcpproxy.xyz",

    defaultTarget: fileConfig.defaultTarget,

    instances: fileConfig.instances || [],

    cors: fileConfig.cors || {
      origin: "*",
      credentials: false,
    },

    healthCheck: fileConfig.healthCheck || {
      interval: 30,
      timeout: 10,
    },

    debug:
      cliArgs.debug ??
      (process.env.DEBUG === "1" || process.env.DEBUG === "true"
        ? true
        : undefined) ??
      fileConfig.debug ??
      false,
  };

  return config;
}

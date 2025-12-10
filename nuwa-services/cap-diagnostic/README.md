# CAP Diagnostic Tool

A server-side diagnostic tool for testing CAP (Capability) configurations in the Nuwa ecosystem.

## Features

- **CAP Validation**: Test CAP configurations for correctness
- **MCP Integration**: Validate MCP server connections and tools
- **LLM Testing**: Test OpenRouter model integrations
- **Batch Processing**: Test multiple CAPs in sequence
- **Detailed Reporting**: Generate comprehensive diagnostic reports

## Installation

```bash
npm install
```

## Usage

### Simple Diagnostic (Recommended)

The simplified version focuses on core validation and basic connectivity testing:

```bash
# Test a single CAP file
npm run simple ./path/to/cap.json

# Test multiple CAPs
npm run simple ./caps/*.json

# Test with sample CAP
npm run simple src/tests/fixtures/sample-cap.json
```

### Full Diagnostic (Advanced)

The full version includes LLM integration testing (requires OpenRouter API key):

```bash
# Test a single CAP file
npm run dev -- diagnose ./path/to/cap.json

# Test multiple CAPs
npm run dev -- diagnose ./caps/*.json

# Test with custom configuration
npm run dev -- diagnose ./cap.json --config ./config.json

# Generate detailed report
npm run dev -- diagnose ./cap.json --output ./report.json
```

### Programmatic Usage

```typescript
import { DiagnosticEngine } from './src/core/diagnostic-engine';

const engine = new DiagnosticEngine();
const result = await engine.diagnoseCap('./path/to/cap.json');
console.log(result);
```

## Configuration

Create a `config.json` file or use environment variables:

```json
{
  "llm": {
    "provider": "openrouter",
    "apiKey": "your-api-key",
    "baseURL": "https://openrouter.ai/api/v1"
  },
  "mcp": {
    "timeout": 30000,
    "retries": 3
  },
  "diagnostic": {
    "testMessages": ["Hello, can you help me?", "What can you do?", "Test your capabilities"]
  }
}
```

## Environment Variables

- `OPENROUTER_API_KEY`: Your OpenRouter API key
- `LLM_GATEWAY_BASE_URL`: Custom LLM gateway URL
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

## Architecture

The diagnostic tool replicates the client-side environment:

- **CAP Resolver**: Parses and validates CAP configurations
- **MCP Manager**: Manages MCP server connections
- **LLM Provider**: Handles OpenRouter integration
- **Diagnostic Engine**: Orchestrates the testing process

## Project Structure

```
nuwa-services/cap-diagnostic/
├── package.json                    # Project configuration and dependencies
├── tsconfig.json                   # TypeScript configuration
├── README.md                       # This file
├── IMPLEMENTATION.md               # Detailed implementation documentation
├── .eslintrc.js                    # ESLint configuration
├── .gitignore                      # Git ignore rules
├── vitest.config.ts                # Test configuration
├── config/
│   └── default.json               # Default configuration file
├── src/
│   ├── core/                      # Core diagnostic components
│   │   ├── diagnostic-engine.ts   # Main diagnostic orchestrator
│   │   ├── cap-resolver.ts        # CAP configuration resolver
│   │   ├── mcp-manager.ts         # MCP server connection manager
│   │   ├── llm-provider.ts        # LLM provider abstraction
│   │   ├── openrouter-provider.ts # OpenRouter API integration
│   │   ├── openrouter-chat-language-model.ts
│   │   ├── openrouter-completion-language-model.ts
│   │   ├── convert-to-openrouter-chat-messages.ts
│   │   ├── convert-to-openrouter-completion-prompt.ts
│   │   ├── map-openrouter-finish-reason.ts
│   │   ├── openrouter-completion-settings.ts
│   │   └── types/
│   │       └── openrouter-chat-settings.ts
│   ├── types/                     # TypeScript type definitions
│   │   ├── cap.ts                 # CAP-related types
│   │   ├── diagnostic.ts          # Diagnostic result types
│   │   └── mcp.ts                 # MCP protocol types
│   ├── utils/                     # Utility functions
│   │   ├── logger.ts              # Logging utilities
│   │   └── validation.ts          # CAP validation utilities
│   ├── tests/                     # Test suites
│   │   ├── fixtures/              # Test data and fixtures
│   │   │   └── sample-cap.json    # Sample CAP for testing
│   │   └── diagnostic.test.ts     # Main test suite
│   ├── cli.ts                     # Command-line interface
│   └── index.ts                   # Main entry point and exports
└── examples/
    └── usage.ts                   # Usage examples and demonstrations
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

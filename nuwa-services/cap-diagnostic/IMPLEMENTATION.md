# CAP Diagnostic Tool - Implementation Summary

## Overview

The CAP Diagnostic Tool is a server-side testing environment that replicates the nuwa-client's CAP execution environment for diagnostic purposes. It provides comprehensive testing of CAP configurations, MCP server integrations, and LLM provider connections.

## Architecture

### Core Components

1. **DiagnosticEngine** (`src/core/diagnostic-engine.ts`)
   - Orchestrates the entire diagnostic process
   - Runs multiple test suites: validation, configuration, LLM, MCP, and end-to-end tests
   - Generates comprehensive diagnostic reports

2. **CapResolver** (`src/core/cap-resolver.ts`)
   - Replicates client-side CAP resolution logic
   - Handles variable substitution (e.g., `{{user_geo}}`)
   - Manages MCP server initialization and tool resolution
   - Provides model instance creation

3. **MCPManager** (`src/core/mcp-manager.ts`)
   - Manages MCP server connections
   - Supports both HTTP Stream and SSE transports
   - Handles tool discovery and caching
   - Provides server connectivity testing

4. **LLMProvider** (`src/core/llm-provider.ts`)
   - Integrates with OpenRouter API
   - Provides model testing capabilities
   - Handles authentication and error management

5. **CapValidator** (`src/utils/validation.ts`)
   - Validates CAP structure and configuration
   - Checks prompt, model, and MCP server configurations
   - Provides detailed error reporting

## Key Features

### Diagnostic Tests

1. **CAP Validation Test**
   - Validates CAP structure against schema
   - Checks required fields and data types
   - Validates MCP server URLs and configurations

2. **Configuration Test**
   - Tests prompt resolution with variable substitution
   - Verifies model accessibility
   - Tests MCP server connectivity

3. **LLM Integration Test**
   - Tests OpenRouter API connectivity
   - Validates model responses
   - Measures response times

4. **MCP Integration Test**
   - Tests MCP server connections
   - Validates tool discovery
   - Checks server availability

5. **End-to-End Test**
   - Runs complete CAP execution flow
   - Tests with configured test messages
   - Validates tool usage and responses

### CLI Interface

The tool provides a comprehensive CLI interface with two main commands:

- `diagnose`: Run full diagnostic tests on CAP files
- `validate`: Quick validation of CAP file structure

### Configuration

Supports flexible configuration through:
- Environment variables
- Configuration files
- Command-line options

## Usage Examples

### CLI Usage

```bash
# Diagnose a single CAP file
npm run dev -- diagnose ./path/to/cap.json

# Diagnose multiple CAPs with custom config
npm run dev -- diagnose ./caps/*.json --config ./config.json --output ./results.json

# Quick validation
npm run dev -- validate ./path/to/cap.json
```

### Programmatic Usage

```typescript
import { DiagnosticEngine } from '@nuwa-ai/cap-diagnostic';

const engine = new DiagnosticEngine(config);
const result = await engine.diagnoseCap(cap);
console.log(result);
```

## Environment Setup

### Prerequisites

- Node.js 18+
- OpenRouter API key
- Access to MCP servers (if testing MCP integration)

### Installation

```bash
cd nuwa-services/cap-diagnostic
npm install
```

### Configuration

Set environment variables:
```bash
export OPENROUTER_API_KEY="your-api-key"
export USER_LOCATION="UTC"  # Optional: for {{user_geo}} variable
```

## Testing

The tool includes comprehensive test suites:

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Integration with Client

The diagnostic tool replicates the client-side environment by:

1. **Reusing Core Logic**: CAP resolution, MCP management, and LLM integration logic
2. **Maintaining Compatibility**: Uses the same types and interfaces as the client
3. **Environment Consistency**: Ensures server-side testing matches client behavior

## Error Handling

Comprehensive error handling includes:
- Network connectivity issues
- API authentication failures
- MCP server unavailability
- Invalid CAP configurations
- Model access problems

## Reporting

Generates detailed reports including:
- Test results and timing
- Error messages and warnings
- Recommendations for fixes
- Overall success/failure status

## Future Enhancements

Potential improvements:
- Support for additional LLM providers
- Batch processing capabilities
- Integration with CI/CD pipelines
- Performance benchmarking
- Custom test case definitions

## Dependencies

Key dependencies:
- `@ai-sdk/provider`: AI SDK integration
- `@modelcontextprotocol/sdk`: MCP protocol support
- `@nuwa-ai/cap-kit`: CAP type definitions
- `commander`: CLI interface
- `winston`: Logging
- `zod`: Schema validation

## File Structure

```
src/
├── core/                 # Core diagnostic components
├── types/               # Type definitions
├── utils/               # Utility functions
├── tests/               # Test suites
└── cli.ts              # CLI interface
```

This implementation provides a robust, server-side testing environment that ensures CAP configurations work correctly before deployment.

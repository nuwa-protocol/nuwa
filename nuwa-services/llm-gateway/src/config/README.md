# Pricing Configuration

This directory contains pricing configuration files for various LLM providers.

## Structure

```
config/
├── openai-pricing.json          # OpenAI model pricing configuration
├── pricingConfigLoader.ts       # Configuration loader utility
└── README.md                    # This file
```

## OpenAI Pricing Configuration

The `openai-pricing.json` file contains:

- **models**: Pricing for individual models
- **modelFamilyPatterns**: Regex patterns to match model variants to base models
- **version**: Configuration version for tracking

### Adding New Models

To add a new model, update the `models` section in `openai-pricing.json`:

```json
{
  "models": {
    "new-model-name": {
      "promptPerMTokUsd": 1.0,
      "completionPerMTokUsd": 2.0,
      "description": "Description of the new model"
    }
  }
}
```

### Adding Model Variants

To add support for model variants (e.g., `gpt-4-0314`, `gpt-4-0613`), add a pattern:

```json
{
  "modelFamilyPatterns": [
    {
      "pattern": "^new-model-family",
      "baseModel": "new-model-name",
      "description": "New model family variants"
    }
  ]
}
```

## Environment Variables

### Custom Configuration Path

Set a custom pricing configuration file:

```bash
PRICING_CONFIG_PATH=/path/to/custom-pricing.json
```

### Runtime Overrides

Override specific model pricing at runtime:

```bash
PRICING_OVERRIDES='{"gpt-4": {"promptPerMTokUsd": 25.0, "completionPerMTokUsd": 50.0}}'
```

## Usage in Code

```typescript
import { pricingRegistry } from '../billing/pricing.js';

// Get pricing for a model
const pricing = pricingRegistry.getPricing('gpt-4');

// Calculate cost
const cost = pricingRegistry.calculateCost('gpt-4', {
  promptTokens: 1000,
  completionTokens: 500
});

// Hot reload configuration
pricingRegistry.reload();
```

## Configuration Validation

The configuration loader includes validation to ensure:

- All required fields are present
- Pricing values are valid numbers
- Model family patterns are valid regex
- Base models referenced in patterns exist

## Future Extensions

This configuration system can be extended to support:

- Multiple provider configurations (OpenRouter, Anthropic, etc.)
- YAML configuration files
- Remote configuration loading
- A/B testing different pricing strategies
- Time-based pricing changes

## Example: Adding Claude Models

To add support for Anthropic's Claude models, create `claude-pricing.json`:

```json
{
  "version": "2024-01",
  "models": {
    "claude-3-opus": {
      "promptPerMTokUsd": 15.0,
      "completionPerMTokUsd": 75.0,
      "description": "Claude 3 Opus"
    },
    "claude-3-sonnet": {
      "promptPerMTokUsd": 3.0,
      "completionPerMTokUsd": 15.0,
      "description": "Claude 3 Sonnet"
    }
  },
  "modelFamilyPatterns": [
    {
      "pattern": "^claude-3-opus",
      "baseModel": "claude-3-opus",
      "description": "Claude 3 Opus variants"
    },
    {
      "pattern": "^claude-3-sonnet",
      "baseModel": "claude-3-sonnet", 
      "description": "Claude 3 Sonnet variants"
    }
  ]
}
```

Then set the environment variable:

```bash
PRICING_CONFIG_PATH=./src/config/claude-pricing.json
```

# Billing System for @nuwa-ai/payment-kit

A flexible, configurable billing system for calculating costs in payment channels. Supports multiple billing strategies and rule-based configuration.

## Features

- **Pluggable Strategies**: Easily add new billing strategies
- **YAML Configuration**: Define billing rules in human-readable YAML files
- **Rule Matching**: Match billing rules based on path, method, model, and custom metadata
- **Caching**: Built-in strategy caching for optimal performance
- **BigInt Precision**: Uses BigInt for precise financial calculations

## Quick Start

### 1. Install Dependencies

```bash
npm install js-yaml @types/js-yaml
```

### 2. Create Configuration File

Create a YAML configuration file (e.g., `config/billing/my-service.yaml`):

```yaml
version: 1
serviceId: my-service
rules:
  - id: upload-pricing
    when:
      path: '/upload'
      method: 'POST'
    strategy:
      type: PerRequest
      price: '5000000000000000' # 0.005 RAV units

  - id: default-pricing
    default: true
    strategy:
      type: PerRequest
      price: '1000000000000000' # 0.001 RAV units
```

### 3. Use in Your Service

```typescript
import { BillingEngine, FileConfigLoader, BillingContext } from '@nuwa-ai/payment-kit/billing';

// Setup
const configLoader = new FileConfigLoader('./config/billing');
const billingEngine = new BillingEngine(configLoader);

// Calculate cost
const context: BillingContext = {
  serviceId: 'my-service',
  operation: 'upload',
  meta: {
    path: '/upload',
    method: 'POST',
    fileSize: 1024000,
  },
};

const cost = await billingEngine.calcCost(context);
console.log(`Cost: ${cost.toString()} (smallest RAV units)`);
```

## Available Strategies

### PerRequest Strategy

Charges a fixed amount per request, regardless of request content.

```yaml
strategy:
  type: PerRequest
  price: '1000000000000000' # Price in smallest RAV units
```

Configuration:

- `price`: Fixed price per request (string, number, or bigint)

## Rule Matching

Rules are matched in order. The first matching rule is used.

### Available Conditions

- `path`: Exact path match
- `pathRegex`: Regular expression path match
- `model`: Model name (for AI services)
- `method`: HTTP method
- Custom metadata fields

### Default Rules

If no rules match, you must have a rule marked with `default: true`:

```yaml
- id: fallback
  default: true
  strategy:
    type: PerRequest
    price: '0'
```

## API Reference

### BillingEngine

Main billing engine that coordinates strategy execution.

```typescript
const engine = new BillingEngine(configLoader);

// Calculate cost
const cost = await engine.calcCost(context);

// Clear cache
engine.clearCache('service-id'); // Clear specific service
engine.clearCache(); // Clear all services

// Preload strategy
await engine.preloadStrategy('service-id');
```

### FileConfigLoader

Loads YAML configuration files from disk.

```typescript
const loader = new FileConfigLoader('./config/billing');

// Load configuration
const config = await loader.load('service-id');

// Clear cache
loader.clearCache('service-id');
```

### BillingContext

Context information for billing calculation:

```typescript
interface BillingContext {
  serviceId: string; // Service identifier
  operation: string; // Operation name
  meta: Record<string, any>; // Additional metadata
}
```

## Error Handling

The billing system throws descriptive errors for:

- Missing configuration files
- Invalid YAML syntax
- Missing required fields
- No matching rules

Always wrap billing calls in try-catch blocks:

```typescript
try {
  const cost = await billingEngine.calcCost(context);
  // Use the cost
} catch (error) {
  console.error('Billing calculation failed:', error);
  // Handle error appropriately
}
```

## Performance

- Configuration files are cached after first load
- Strategies are cached per service
- Rule matching is O(n) where n is number of rules
- BigInt calculations are fast for typical billing amounts

## Testing

Run the billing system tests:

```bash
npm test -- src/billing
```

## Examples

See the `examples/` directory for complete usage examples:

- `billing-config.yaml`: Example configuration file
- `billing-usage.ts`: Usage examples and Express.js integration

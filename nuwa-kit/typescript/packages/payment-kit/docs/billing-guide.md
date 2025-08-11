# Nuwa Payment Kit - Billing System Guide

> **Status**: Implemented & Active
>
> **Audience**: Developers integrating the payment kit, and future contributors.
>
> This document provides a comprehensive guide to the design, architecture, and usage of the billing system within `@nuwa-ai/payment-kit`. It reflects the current, unified V2 implementation.

---

## 1. Overview & Goals

The billing system is a core component of the Nuwa Payment Kit, designed to be a flexible, configuration-driven, and auditable engine for calculating costs associated with service usage.

| Goal           | Description                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Pluggable**  | Billing logic is implemented via a `Strategy` pattern, allowing services to use built-in or custom logic.   |
| **Automated**  | Automatically detects whether to bill before (**pre-flight**) or after (**post-flight**) request execution. |
| **Integrated** | Billing rules are defined directly at the routing layer, tightly coupling routes to their pricing models.   |
| **Efficient**  | Cost calculations are performed with native BigInts, and core logic is optimized for minimal overhead.      |
| **Auditable**  | Every billing event is tied to a specific rule, making it easy to trace and audit costs.                    |
| **Extensible** | Designed to be easily extended with new strategies and multi-currency support via `RateProvider`.           |

---

## 2. Architecture

The billing system is tightly integrated with the Express web framework. Its architecture revolves around a central middleware that orchestrates rule matching, authentication, and cost calculation.

```mermaid
graph TD
    subgraph "Express Application"
        A[HTTP Request] --> B{ExpressPaymentKit Middleware};
    end

    subgraph "Billing System Components"
        B --> C{1. Find BillingRule};
        C --> D{2. Perform Auth};
        D --> E{3. Check Strategy};
        E --> F[deferred: false?];
        F -- Yes --> G[Pre-flight Billing];
        F -- No --> H[Post-flight Billing];

        G --> I[BillingEngine];
        H --> J[Business Logic Handler];
        J -- "res.locals.usage" --> K[res.on('header')];
        K --> H;
        H --> I;

        I --> L[Strategy.evaluate()];
        L --> M[Cost (bigint)];
    end

    subgraph "Request Lifecycle"
        I --> N[4. Process Payment];
        N --> O[Next() / Send Response];
        A ~~~ O;
    end

    style B fill:#f9f,stroke:#333,stroke-width:2px
    style I fill:#ccf,stroke:#333,stroke-width:2px
```

**Key Components**:

- **`ExpressPaymentKit`**: The main entry point. It provides a middleware that intercepts requests for registered routes.
- **`BillableRouter`**: An internal router that stores `BillingRule`s associated with your application's routes.
- **`HttpBillingMiddleware`**: A framework-agnostic middleware that contains the core logic for detecting billing modes and processing payments.
- **`BillingEngine`**: The engine responsible for invoking the correct `Strategy` to calculate the final cost based on the context.
- **`Strategy`**: An interface for different pricing models (e.g., `PerRequest`, `PerToken`). Each strategy knows how to calculate a cost from a `BillingContext`.

---

## 3. Core Concepts

### BillingRule

A `BillingRule` is a JavaScript object that defines the billing and authentication behavior for a route. It's the central piece of configuration.

```typescript
interface BillingRule {
  id: string;
  when?: { path?: string; method?: string; [key: string]: any }; // Matching conditions
  strategy: StrategyConfig; // e.g., { type: 'PerRequest', price: '1000' }
  authRequired?: boolean;
  paymentRequired?: boolean;
}
```

### Strategy & StrategyConfig

A `Strategy` is a class that implements a specific pricing logic. It's defined by a `StrategyConfig` object within a `BillingRule`. The most important property of a strategy is `deferred`.

```typescript
interface Strategy {
  readonly deferred?: boolean; // Does this strategy need execution results?
  evaluate(ctx: BillingContext): Promise<bigint>;
}
```

- **`deferred: false` (Default)**: The cost can be calculated **before** the main business logic runs (pre-flight). Examples: `PerRequest`, `FixedPrice`.
- **`deferred: true`**: The cost calculation depends on the result of the business logic (e.g., token usage from an LLM call) and must be calculated **after** it runs (post-flight). Example: `PerToken`.

### BillingContext

This object provides all necessary information for a strategy to calculate the cost.

```typescript
interface BillingContext {
  serviceId: string;
  operation: string;
  assetId?: string; // For multi-currency support
  meta: Record<string, any>; // The critical part! Contains path, method, and usage data.
}
```

---

## 4. The Billing Flow: How It Works

The system intelligently chooses between two billing flows: Pre-flight and Post-flight.

### A. Pre-flight Billing (e.g., `PerRequest`)

This is the simplest flow, used when a strategy has `deferred: false`.

1.  A request hits a registered route (e.g., `GET /echo`).
2.  The `ExpressPaymentKit` middleware finds the matching `BillingRule`.
3.  It checks the rule's strategy (`PerRequest`) and sees `deferred` is `false`.
4.  It immediately invokes the `BillingEngine` to calculate the cost.
5.  The payment is processed. If successful, `next()` is called, and the request proceeds to the business logic handler. If it fails (e.g., insufficient funds), the request is rejected with an appropriate HTTP error.

### B. Post-flight Billing (e.g., `PerToken`)

This flow is used for strategies with `deferred: true`.

1.  A request hits a registered route (e.g., `POST /chat/completions`).
2.  The middleware finds the `BillingRule` and sees its `PerToken` strategy has `deferred: true`.
3.  **Pre-flight Phase**:
    - The middleware performs initial checks (e.g., validating the payment header) but **does not calculate the final cost**.
    - It creates a `PaymentSession` object containing the context and attaches it to `res.locals`.
    - It attaches a **one-time listener to the Express `response.on('header')` event**. This is the critical step that allows it to execute logic just before the response is sent.
    - It calls `next()` to pass control to your business logic handler.
4.  **Business Logic Execution**:
    - Your handler runs (e.g., calls an LLM API).
    - It gets the results, including usage data (`{ usage: { total_tokens: 123 } }`).
    - **Crucially, you must attach this usage data to `res.locals.usage`**.
    - Your handler calls `res.json()` or `res.send()` to finalize the response.
5.  **Post-flight Phase**:
    - Just before Express sends the response headers, the `res.on('header')` listener fires.
    - The listener retrieves the `PaymentSession` and the `usage` data from `res.locals`.
    - It now invokes the `BillingEngine` with the complete context (including token usage) to calculate the final cost.
    - The payment is processed, and the resulting SubRAV is added to the response headers.
    - The response is sent to the client.

---

## 5. Developer's Guide: Integration & Usage

### Step 1: Initialize the Payment Kit

In your Express application setup:

```typescript
import { createExpressPaymentKitFromEnv } from '@nuwa-ai/payment-kit';

// In your server setup function
async function startServer() {
  const env = loadYourIdentityAndConfig(); // Your method to load keys, etc.

  const paymentKit = await createExpressPaymentKitFromEnv(env, {
    serviceId: 'my-awesome-service',
    adminDid: 'did:rooch:your-admin-did',
    debug: true,
  });

  const app = express();
  app.use(express.json());

  // Mount the payment kit router
  app.use(paymentKit.router);

  // Define your routes AFTER mounting the kit
  // ... see Step 2

  app.listen(3000, () => console.log('Server running on port 3000'));
}
```

### Step 2: Define Billable Routes

Use the `paymentKit` instance to define routes.

#### Example 1: Pre-flight Billing (`PerRequest`)

The cost is fixed per request. The `pricing` option is a shorthand for a `PerRequest` strategy.

```typescript
paymentKit.get(
  '/echo',
  {
    pricing: '1000000000', // 1 picoUSD per request
    paymentRequired: true,
  },
  (req, res) => {
    // Business logic runs after billing is confirmed.
    res.json({ message: 'echo', query: req.query.q });
  }
);
```

#### Example 2: Post-flight Billing (`PerToken`)

Here, we explicitly define a `PerToken` strategy.

```typescript
paymentKit.post(
  '/chat/completions',
  {
    pricing: {
      // Use the 'pricing' property for strategy config
      type: 'PerToken',
      unitPricePicoUSD: '20000000', // price per token
      usageKey: 'usage.total_tokens', // Path to find token count in res.locals.usage
    },
    authRequired: true,
  },
  async (req, res, next) => {
    try {
      // 1. Call your business logic (e.g., an LLM)
      const llmResponse = await callMyLlm(req.body);

      // 2. IMPORTANT: Attach usage data to res.locals
      // The `usageKey` from the strategy config will be used to find the value.
      res.locals.usage = {
        usage: {
          total_tokens: llmResponse.usage.total_tokens,
        },
      };

      // 3. Send the response as usual
      res.json(llmResponse);
    } catch (error) {
      next(error);
    }
  }
);
```

---

## 6. Extending the System: Custom Strategies

To create a new billing strategy:

1.  **Create the Strategy Class**: Implement the `Strategy` interface. Set `deferred` to `true` if it needs post-flight data.
2.  **Register the Strategy**: Use the `registerStrategy` function to make the system aware of your new strategy.

**Example: A `PerCharacter` Strategy**

```typescript
// src/billing/strategies/perCharacter.ts
import { BaseStrategy, BillingContext } from '@nuwa-ai/payment-kit';

export class PerCharacterStrategy extends BaseStrategy {
  // This strategy is post-flight because it needs the response body length.
  public readonly deferred = true;
  private readonly pricePerChar: bigint;

  constructor(config: { price: string }) {
    super();
    this.pricePerChar = BigInt(config.price);
  }

  async evaluate(ctx: BillingContext): Promise<bigint> {
    const charCount = BigInt(ctx.meta.usage?.character_count ?? 0);
    return charCount * this.pricePerChar;
  }
}

// src/billing/strategy-registry.ts
import { registerStrategy } from '@nuwa-ai/payment-kit';
import { PerCharacterStrategy } from './strategies/perCharacter';

registerStrategy('PerCharacter', config => new PerCharacterStrategy(config as any));
```

You can now use `type: 'PerCharacter'` in your route definitions.

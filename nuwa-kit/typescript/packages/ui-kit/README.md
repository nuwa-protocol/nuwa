# @nuwa-ai/ui-kit

Nuwa UI SDK for TypeScript/React - A powerful library for building iframe-based UI components with bidirectional communication between your Cap UI and the Nuwa Client.

This SDK enables two primary use cases:

1. **[Nuwa Client Integration](#-nuwa-client-integration)**: Call Nuwa Client functions from your UI (send prompts, add selections, etc.)
2. **[MCP Tool Exposure](#-mcp-tool-exposure)**: Expose your UI functionality as MCP tools for AI agents to interact with

Together, these create a bidirectional connection where your Cap UI can both control the Nuwa Client and be controlled by AI.

## Installation

```bash
# npm
npm install @nuwa-ai/ui-kit

# yarn
yarn add @nuwa-ai/ui-kit

# pnpm
pnpm add @nuwa-ai/ui-kit

# bun
bun add @nuwa-ai/ui-kit
```

## 🔗 Nuwa Client Integration

Connect to the Nuwa Client to call its functions from your Cap UI.

### React Hook (Recommended)

```jsx
import React, { useEffect, useState } from 'react';
import { NuwaProvider, useNuwa } from '@nuwa-ai/ui-kit';

function MyCapUI() {
  const { nuwa, connected, theme } = useNuwa();
  const [input, setInput] = useState('');

  // Load previously saved state (if any)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const prev = await nuwa.getState<string | null>();
      if (mounted && typeof prev === 'string') setInput(prev);
    })();
    return () => { mounted = false; };
  }, [nuwa]);

  // Save state
  const handleInputChange = async (e) => {
    const value = e.target.value;
    setInput(value);
    await nuwa.saveState(value);
  };

  const handleSendPrompt = async () => {
    await nuwa.sendPrompt('The user wants to do this');
  };

  const handleAIGeneration = async () => {
    const stream = nuwa.createAIStream({ prompt: 'Generate something amazing' });
    await stream.execute({
      onChunk: (chunk) => {
        if (chunk.type === 'content') setInput((prev) => prev + chunk.content);
      },
    });
  };

  return (
    <div className="p-4">
      <h1>My Cap UI</h1>
      <p>Connected: {String(connected)}</p>
      <input value={input} onChange={handleInputChange} />

      <button onClick={handleSendPrompt}>Send Prompt to AI</button>
      <button onClick={handleAIGeneration}>Let AI Generate</button>
    </div>
  );
}

export default function App() {
  return (
    <NuwaProvider
      autoHeight
      onConnected={() => console.log('Connected to Nuwa!')}
      onError={(err) => console.error('Connection error:', err)}
    >
      <MyCapUI />
    </NuwaProvider>
  );
}
```

### Vanilla JavaScript

```javascript
import { NuwaClient } from '@nuwa-ai/ui-kit';

const client = new NuwaClient();

// Connect before invoking methods
await client.connect();

// Send a prompt to the AI
await client.sendPrompt('Generate something amazing');

// Add a selection to the parent Nuwa client
await client.addSelection('Weather Data', 'Current temperature is 72°F');

// Save and retrieve state
await client.saveState({ userPreferences: { theme: 'dark' } });
const state = await client.getState();

// Stream AI responses (capId is optional)
const stream = client.createAIStream({
  prompt: 'Stream a poem line by line',
});

// Start and await until completion; observe live chunks via callbacks
const { result, error } = await stream.execute({
  onChunk: chunk => {
    if (chunk.type === 'content') console.log('chunk:', chunk.content);
  },
  onError: err => console.error('stream error:', err),
});
console.log('final result:', result);
if (error) console.warn('ended with error:', error);

// Abort when you are done (optional)
// stream.abort();

// Inspect live state anytime
console.log('status:', stream.status); // 'idle' | 'running' | 'completed' | 'error' | 'aborted'
console.log('error:', stream.error); // Error | null
console.log('result:', stream.result); // string or array of chunks
```

### Auto Height Adjustment

The SDK provides automatic height adjustment to ensure your iframe content is fully visible. Wrap your app with `NuwaProvider` and set `autoHeight`:

```jsx
import React from 'react';
import { NuwaProvider } from '@nuwa-ai/ui-kit';
import App from './App';

export default function Root() {
  return (
    <NuwaProvider autoHeight>
      <App />
    </NuwaProvider>
  );
}
```

## 🤖 MCP Tool Exposure

Expose your UI functionality as MCP (Model Context Protocol) tools that AI agents can interact with. This creates a bidirectional communication channel where AI can control your UI.

### Basic MCP Server Setup

```jsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PostMessageMCPTransport } from '@nuwa-ai/ui-kit';
import { z } from 'zod';

// Create MCP transport for iframe communication
const transport = new PostMessageMCPTransport();

// Initialize MCP server
const server = new McpServer({
  name: 'my-cap-mcp',
  version: '1.0.0',
});

// Register a tool that AI can call
server.registerTool(
  'update_content',
  {
    title: 'Update UI Content',
    description: 'Update the content displayed in the UI',
    inputSchema: {
      content: z.string().describe('The new content to display'),
    },
  },
  ({ content }) => {
    // Your UI update logic here
    updateUIContent(content);

    return {
      content: [
        {
          type: 'text',
          text: `Content updated successfully: ${content}`,
        },
      ],
    };
  }
);

// Connect server to transport
server.connect(transport);
```

### Returning UI Resources from MCP Tools

You can return UI resources from your MCP tools to tell the client to render specific UI components for a tool execution:

```javascript
import { createUIToolResult } from '@nuwa-ai/ui-kit';

server.registerTool(
  'show_dashboard',
  {
    title: 'Show Dashboard',
    description: 'Display the analytics dashboard UI',
    inputSchema: {
      period: z.string().describe('Time period for analytics'),
    },
  },
  ({ period }) => {
    // Return a UI resource that tells the client to render UI at the given path
    return createUIToolResult(
      `/dashboard?period=${period}`,
      'Analytics Dashboard',
      `Dashboard showing ${period} analytics data`
    );
  }
);
```

The client will receive this resource and construct the full URL using its known origin to render your UI component.

**UI Resource Type:**

```typescript
interface UIResource {
  uri: string; // capui://Dashboard
  name: string; // "Analytics Dashboard"
  description?: string; // Optional description
  mimeType: 'text/x-nuwa-capui-path'; // MIME type identifier
  path: string; // "/dashboard?period=week"
}
```

**Helper Functions:**

- `createUIResource(path, name?, description?)` - Create a UI resource
- `createUIToolResult(path, name?, description?)` - Create a complete tool result with UI resource

### Complete Example with React Hook

```jsx
import { useEffect, useState } from 'react';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PostMessageMCPTransport, NuwaProvider, useNuwa } from '@nuwa-ai/ui-kit';
import { z } from 'zod';

function MyCapWithMCP() {
  const [content, setContent] = useState('Initial content');
  const { nuwa } = useNuwa();

  useEffect(() => {
    // Set up MCP server
    const transport = new PostMessageMCPTransport();

    const server = new McpServer({
      name: 'content-editor-mcp',
      version: '1.0.0',
    });

    // Register tools for AI to interact with your UI
    server.registerTool(
      'update_content',
      {
        title: 'Update Display Content',
        description: 'Update the content shown in the UI',
        inputSchema: {
          content: z.string().describe('The content to display'),
        },
      },
      ({ content: newContent }) => {
        setContent(newContent);
        return {
          content: [
            {
              type: 'text',
              text: `Content updated to: ${newContent}`,
            },
          ],
        };
      }
    );

    server.registerTool(
      'get_content',
      {
        title: 'Get Current Content',
        description: 'Retrieve the current content from the UI',
        inputSchema: {},
      },
      () => ({
        content: [
          {
            type: 'text',
            text: `Current content: ${content}`,
          },
        ],
      })
    );

    // Connect server
    server.connect(transport);

    return () => {
      server.close();
    };
  }, [content]);

  return (
    <div className="p-4">
      <h1>My Cap UI with MCP</h1>

      <div className="content-display">
        <h2>Current Content:</h2>
        <p>{content}</p>
      </div>

      <p className="text-sm text-gray-600">
        AI agents can now interact with this UI through MCP tools!
      </p>
    </div>
  );
}
```

### MCP Transport Options

```javascript
const transport = new PostMessageMCPTransport({
  targetWindow: window.parent, // Target window (usually parent)
  targetOrigin: '*', // Target origin (* for dev, specific domain for prod)
  allowedOrigins: ['*'], // Allowed origins for security
  debug: true, // Enable debug logging
  timeout: 10000, // Request timeout in ms
  securityPolicy: {
    enforceOriginValidation: true, // Enforce origin validation
    maxMessageSize: 1024 * 1024, // Max message size (1MB)
    rateLimits: [
      // Rate limiting
      { windowMs: 60000, maxRequests: 100 },
    ],
  },
});
```

## 🚀 Complete Example

For a full working example, see **Nuwa Caps**:

**📁 [`nuwa-caps`](https://github.com/nuwa-protocol/nuwa-caps)**

## API Reference

### `NuwaProvider(props)` and `useNuwa()`

Use `NuwaProvider` to set up the connection and wrap your UI; call `useNuwa()` inside to access the client and state.

`NuwaProvider` props:

- `autoHeight?: boolean` - Auto-adjust parent iframe height (default `true`)
- `allowedOrigins?: string[]` - Allowed origins (default `["*"]`)
- `timeout?: number` - Connection timeout in ms (default `2000`)
- `debug?: boolean` - Enable debug logging
- `methodTimeout?, methodTimeouts?, methodRetries?, methodRetriesMap?` - Per-call behavior
- `streamTimeout?, streamRetries?, streamBufferSize?` - Streaming config
- `onConnected?(), onError?(error)` - Lifecycle callbacks
- `className?, style?` - Provider container props (dark class toggles automatically with theme)

`useNuwa()` returns:

- `nuwa: NuwaClient` - The client instance
- `theme: 'light' | 'dark'` - Current theme pushed from parent
- `connected: boolean` - Connection state

### `NuwaClient` Class

**Constructor Options:**

- Same as `NuwaProvider` client options (`allowedOrigins`, `timeout`, `debug`, `methodTimeout(s)`, retry maps, stream settings)

**Methods:**

- `connect(): Promise<void>` - Establish connection with parent
- `sendPrompt(prompt: string): Promise<void>` - Send a prompt to parent
- `setHeight(height: string | number): Promise<void>` - Set iframe height
- `addSelection(label: string, message: string | Record<string, any>): Promise<void>` - Add selection to parent
- `saveState<T>(state: T): Promise<void>` - Save state data to parent
- `getState<T>(): Promise<T | null>` - Retrieve state data from parent
- `createAIStream<T>(request: StreamAIRequest<T>): StreamHandle<T>` - Factory for starting a server-side stream. Call `await execute({ onChunk?, onError? })` to run until completion; the promise resolves to `{ result, error }`. Inspect live `status`, `error`, `result` and use `abort()` to cancel.
- `reconnect(): Promise<void>` - Reconnect to parent if connection is lost
- `disconnect(): void` - Disconnect from parent
- `getStats()` - Get connection statistics

> Note: `useNuwa()` exposes `connected`. You can also rely on `onConnected`/`onError` callbacks in the provider for lifecycle events.

### Streaming API

```ts
// Basic
const s1 = nuwa.createAIStream({ prompt: 'Stream summary' });
const { result: res1, error: err1 } = await s1.execute({
  onChunk: chunk => {
    if (chunk.type === 'content') console.log(chunk.content);
  },
});
console.log('status:', s1.status);
console.log('result:', res1);
if (err1) console.warn('error:', err1);

// With explicit error callback
const s2 = nuwa.createAIStream({ prompt: 'Stream structured output' });
const { result: res2, error: err2 } = await s2.execute({
  onChunk: chunk => {
    if (chunk.type === 'content') console.log('content:', chunk.content);
  },
  onError: err => console.error('stream error (live):', err),
});
```

Note: Callbacks passed to `execute()` are handled locally by the SDK and are not sent to the parent window, as functions cannot be cloned across `postMessage`.

## Requirements

- React >= 16.8.0 (for React integration)
- Modern browser with iframe support
- Parent window must be configured to receive messages

## License

Apache-2.0

## Contributing

This package is part of the Nuwa AI ecosystem. Contributions are welcome!

---

Built with ❤️ by the Nuwa AI team

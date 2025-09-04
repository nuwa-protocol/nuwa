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
import { useNuwaClient } from '@nuwa-ai/ui-kit';

function MyCapUI() {
  const { containerRef, nuwaClient, isConnected } = useNuwaClient({
    autoAdjustHeight: true, // Automatically adjust iframe height
    onConnected: () => console.log('Connected to parent!'),
    onError: (error) => console.error('Connection error:', error)
  });

  const handleSendPrompt = async () => {
    await nuwaClient.sendPrompt('Generate something amazing');
  };

  const handleAddSelection = async () => {
    await nuwaClient.addSelection('My Selection', 'This is a selection message');
  };

  return (
    <div ref={containerRef} className="p-4">
      <h1>My Cap UI</h1>
      <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      
      <button onClick={handleSendPrompt} disabled={!isConnected}>
        Send Prompt to AI
      </button>
      
      <button onClick={handleAddSelection} disabled={!isConnected}>
        Add Selection to Chat
      </button>
    </div>
  );
}
```

### Vanilla JavaScript

```javascript
import { NuwaClient } from '@nuwa-ai/ui-kit';

const client = new NuwaClient();

// The client auto-connects by default
await client.connect();

// Send a prompt to the AI
await client.sendPrompt('Generate something amazing');

// Add a selection to the parent Nuwa client
await client.addSelection('Weather Data', 'Current temperature is 72°F');

// Save and retrieve state
await client.saveState({ userPreferences: { theme: 'dark' } });
const state = await client.getState();
```

### Auto Height Adjustment

The SDK provides automatic height adjustment to ensure your iframe content is fully visible:

```jsx
function WeatherApp() {
  const [weatherData, setWeatherData] = useState(null);
  const { containerRef, isConnected } = useNuwaClient({ 
    autoAdjustHeight: true,
    onConnected: () => console.log('Connected to parent!')
  });

  useEffect(() => {
    fetchWeatherData().then(setWeatherData);
  }, []);

  return (
    <div ref={containerRef}>
      <div className="p-4">
        <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
        {weatherData ? (
          <WeatherDisplay data={weatherData} />
        ) : (
          <div>Loading weather...</div>
        )}
      </div>
    </div>
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
  name: "my-cap-mcp",
  version: "1.0.0",
});

// Register a tool that AI can call
server.registerTool(
  "update_content",
  {
    title: "Update UI Content",
    description: "Update the content displayed in the UI",
    inputSchema: {
      content: z.string().describe("The new content to display"),
    },
  },
  ({ content }) => {
    // Your UI update logic here
    updateUIContent(content);
    
    return {
      content: [
        {
          type: "text",
          text: `Content updated successfully: ${content}`,
        },
      ],
    };
  },
);

// Connect server to transport
server.connect(transport);
```

### Complete Example with React Hook

```jsx
import { useEffect, useState } from 'react';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PostMessageMCPTransport, useNuwaClient } from '@nuwa-ai/ui-kit';
import { z } from 'zod';

function MyCapWithMCP() {
  const [content, setContent] = useState('Initial content');
  const { containerRef, nuwaClient, isConnected } = useNuwaClient({ 
    autoAdjustHeight: true,
    onConnected: () => console.log('Connected to parent!')
  });

  useEffect(() => {
    // Set up MCP server
    const transport = new PostMessageMCPTransport();

    const server = new McpServer({
      name: "content-editor-mcp",
      version: "1.0.0",
    });

    // Register tools for AI to interact with your UI
    server.registerTool(
      "update_content",
      {
        title: "Update Display Content",
        description: "Update the content shown in the UI",
        inputSchema: {
          content: z.string().describe("The content to display"),
        },
      },
      ({ content: newContent }) => {
        setContent(newContent);
        return {
          content: [{
            type: "text",
            text: `Content updated to: ${newContent}`,
          }],
        };
      },
    );

    server.registerTool(
      "get_content",
      {
        title: "Get Current Content",
        description: "Retrieve the current content from the UI",
        inputSchema: {},
      },
      () => ({
        content: [{
          type: "text",
          text: `Current content: ${content}`,
        }],
      }),
    );

    // Connect server
    server.connect(transport);

    return () => {
      server.close();
    };
  }, [content]);

  return (
    <div ref={containerRef} className="p-4">
      <h1>My Cap UI with MCP</h1>
      <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      
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
  targetWindow: window.parent,     // Target window (usually parent)
  targetOrigin: "*",               // Target origin (* for dev, specific domain for prod)
  allowedOrigins: ["*"],           // Allowed origins for security
  debug: true,                     // Enable debug logging
  timeout: 10000,                  // Request timeout in ms
  securityPolicy: {
    enforceOriginValidation: true, // Enforce origin validation
    maxMessageSize: 1024 * 1024,   // Max message size (1MB)
    rateLimits: [                  // Rate limiting
      { windowMs: 60000, maxRequests: 100 }
    ]
  }
});
```

## 🚀 Complete Example

For a full working example, see our **Cap UI example** in the repository:

**📁 [`examples/cap-ui/`](./../../examples/cap-ui/)**


## API Reference

### `useNuwaClient(options)`

**Options:**
- `autoAdjustHeight?: boolean` - Enable automatic height adjustment (default: `false`)
- `allowedOrigins?: string[]` - Allowed origins for iframe communication (default: `["*"]`)
- `timeout?: number` - Connection timeout in milliseconds (default: `1000`)
- `autoConnect?: boolean` - Auto-connect on instantiation (default: `true`)
- `debug?: boolean` - Enable debug logging (default: `false`)
- `methodTimeout?: number` - Timeout for method calls in milliseconds (default: `2000`)
- `onConnected?: () => void` - Callback when connection is established
- `onError?: (error: Error) => void` - Callback when connection fails

**Returns:**
- `nuwaClient: NuwaClient` - The NuwaClient instance
- `isConnected: boolean` - Reactive connection status
- `containerRef: RefObject<HTMLDivElement>` - Ref to attach to your root container

### `NuwaClient` Class

**Constructor Options:**
- Same as `useNuwaClient` options above

**Methods:**
- `connect(): Promise<void>` - Establish connection with parent
- `sendPrompt(prompt: string): Promise<void>` - Send a prompt to parent
- `setHeight(height: string | number): Promise<void>` - Set iframe height
- `addSelection(label: string, message: string | Record<string, any>): Promise<void>` - Add selection to parent
- `saveState<T>(state: T): Promise<void>` - Save state data to parent
- `getState<T>(): Promise<T | null>` - Retrieve state data from parent
- `reconnect(): Promise<void>` - Reconnect to parent if connection is lost
- `disconnect(): void` - Disconnect from parent
- `getStats()` - Get connection statistics

> **Note**: The `isConnected` property has been removed from the `NuwaClient` class. Use the `isConnected` state from the `useNuwaClient` hook instead for reactive connection status.

## Best Practice - Always Use Container Ref

When using `autoAdjustHeight`, always attach the `containerRef` to your root container:

```jsx
// ✅ Correct
const { containerRef } = useNuwaClient({ autoAdjustHeight: true });
return <div ref={containerRef}>Content</div>;

// ❌ Wrong - height detection won't work
const { containerRef } = useNuwaClient({ autoAdjustHeight: true });
return <div>Content</div>; // Missing ref
```

## Requirements

- React >= 16.8.0 (for React integration)
- Modern browser with iframe support
- Parent window must be configured to receive messages

## License

MIT

## Contributing

This package is part of the Nuwa AI ecosystem. Contributions are welcome!

---

Built with ❤️ by the Nuwa AI team
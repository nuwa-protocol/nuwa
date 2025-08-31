# @nuwa-kit/ui-kit

Nuwa UI SDK for TypeScript/React - A powerful library for building iframe-based UI components with seamless parent-child communication.

With this SDK, you can embed your web page into NuwaAI client as the UI of your Cap. Your UI will be able to call certain functions in the Nuwa Client such as running a tool call or send a new prompt on behalf of the user.

## Installation

```bash
# npm
npm install @nuwa-kit/ui-kit

# yarn
yarn add @nuwa-kit/ui-kit

# pnpm
pnpm add @nuwa-kit/ui-kit

# bun
bun add @nuwa-kit/ui-kit
```

## Quick Start

### React Hook (Recommended)

```jsx
import { useNuwaClient } from '@nuwa-kit/ui-kit';

function MyComponent() {
  const { containerRef, sendLog, sendPrompt, isConnected } = useNuwaClient({
    autoAdjustHeight: true // Automatically adjust iframe height - Must set the containerRef for the outer div
  });

  const handleSendMessage = async () => {
    const response = await sendLog('Hello from iframe!');
    console.log('Response:', response);
  };

  const handleSendPrompt = async () => {
    await sendPrompt('Generate something amazing');
  };

  return (
    <div ref={containerRef} className="p-4">
      <h1>My Cap UI</h1>
      <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      
      <button onClick={handleSendMessage} disabled={!isConnected}>
        Send Message
      </button>
      
      <button onClick={handleSendPrompt} disabled={!isConnected}>
        Send Prompt
      </button>
    </div>
  );
}
```

### Auto Height Adjustment

The SDK provides automatic height adjustment to ensure your iframe content is fully visible:

```jsx
function WeatherApp() {
  const [weatherData, setWeatherData] = useState(null);
  const { containerRef } = useNuwaClient({ autoAdjustHeight: true });

  useEffect(() => {
    fetchWeatherData().then(setWeatherData);
  }, []);

  return (
    <div ref={containerRef}>
      {weatherData ? (
        <WeatherDisplay data={weatherData} />
      ) : (
        <div>Loading weather...</div>
      )}
    </div>
  );
}
```

**Features:**
- ✅ Automatic height detection on initial load
- ✅ Dynamic height adjustment when content changes
- ✅ Responsive height updates on window resize
- ✅ Works with async content loading
- ✅ Uses MutationObserver for efficient DOM change detection

### Vanilla JavaScript

```javascript
import { NuwaClient } from '@nuwa-kit/ui-kit';

const ui = new NuwaClient();

await ui.connect();

// Send messages
await ui.sendLog('Hello from Cap UI!');
await ui.sendPrompt('Generate something amazing');

// Set iframe height manually
await ui.setHeight(400);
```

## API Reference

### `useCapEmbedUIKit(options)`

**Options:**
- `autoAdjustHeight?: boolean` - Enable automatic height adjustment (default: `false`)

**Returns:**
- `isConnected: boolean` - Connection status
- `containerRef: RefObject<HTMLDivElement>` - Ref to attach to your root container
- `sendLog(message: string): Promise<string>` - Send a console log message to the Nuwa client
- `sendPrompt(prompt: string): Promise<string>` - Send a prompt to the Nuwa client  
- `setUIHeight(height: number): Promise<void>` - Manually set the iframe height in the Nuwa client

### `CapEmbedUIKit` Class

**Methods:**
- `connect(): Promise<void>` - Establish connection with parent
- `sendMessage(message: string): Promise<string>` - Send a message to parent
- `sendPrompt(prompt: string): Promise<string>` - Send a prompt to parent
- `setUIHeight(height: number): Promise<void>` - Set iframe height

## Best Practices

### 1. Always Use Container Ref
```jsx
// ✅ Correct
const { containerRef } = useCapEmbedUIKit({ autoAdjustHeight: true });
return <div ref={containerRef}>Content</div>;

// ❌ Wrong - height detection won't work
const { containerRef } = useCapEmbedUIKit({ autoAdjustHeight: true });
return <div>Content</div>; // Missing ref
```

### 2. Handle Async Content
```jsx
// ✅ Good - Always render container
return (
  <div ref={containerRef}>
    {data ? <Content data={data} /> : <Loading />}
  </div>
);

// ❌ Avoid - Conditional rendering of container
if (!data) return null; // This breaks height detection
return <div ref={containerRef}><Content data={data} /></div>;
```

### 3. Check Connection Status
```jsx
const handleAction = async () => {
  if (!isConnected) {
    console.warn('Not connected to parent');
    return;
  }
  await sendMessage('Action performed');
};
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
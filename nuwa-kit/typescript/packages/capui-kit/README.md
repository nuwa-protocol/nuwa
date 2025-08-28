# @nuwa-kit/capui-kit

Nuwa CapUI SDK for TypeScript/React - A powerful library for building iframe-based UI components with seamless parent-child communication.

With this SDK, you can embed your web page into NuwaAI client as the UI of your Cap. Your UI will be able to call certain functions in the Nuwa Client such as running a tool call or send a new prompt on behalf of the user.

## Installation

```bash
# npm
npm install @nuwa-kit/capui-kit

# yarn
yarn add @nuwa-kit/capui-kit

# pnpm
pnpm add @nuwa-kit/capui-kit

# bun
bun add @nuwa-kit/capui-kit
```

## Quick Start

### React Hook (Recommended)

```jsx
import { useCapEmbedUIKit } from '@nuwa-kit/capui-kit';

function MyComponent() {
  const { containerRef, sendMessage, sendPrompt, isConnected } = useCapEmbedUIKit({
    autoAdjustHeight: true // Automatically adjust iframe height
  });

  const handleSendMessage = async () => {
    const response = await sendMessage('Hello from iframe!');
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
  const { containerRef } = useCapEmbedUIKit({ autoAdjustHeight: true });

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
import { CapEmbedUIKit } from '@nuwa-kit/capui-kit';

const capUI = new CapEmbedUIKit();

await capUI.connect();

// Send messages
await capUI.sendMessage('Hello from Cap UI!');
await capUI.sendPrompt('Generate something amazing');

// Set iframe height manually
await capUI.setUIHeight(400);
```

## API Reference

### `useCapEmbedUIKit(options)`

**Options:**
- `autoAdjustHeight?: boolean` - Enable automatic height adjustment (default: `false`)

**Returns:**
- `isConnected: boolean` - Connection status
- `containerRef: RefObject<HTMLDivElement>` - Ref to attach to your root container
- `sendMessage(message: string): Promise<string>` - Send a message to the parent
- `sendPrompt(prompt: string): Promise<string>` - Send a prompt to the parent  
- `setUIHeight(height: number): Promise<void>` - Manually set iframe height

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
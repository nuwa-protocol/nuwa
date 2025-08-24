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

### Vanilla JavaScript

```javascript
import { CapUI } from '@nuwa-kit/capui-kit';

const capUI = new CapUI({
  onReceiveMessage: (message) => {
    console.log('Received:', message);
    return 'Message processed';
  },
  onError: (error) => {
    console.error('CapUI Error:', error);
  },
  onConnectionChange: (isConnected) => {
    console.log('Connection status:', isConnected);
  }
});


await capUI.sendMessage('Hello from Cap UI!'); // Send a message to the Nuwa client
await capUI.sendToolCall('{"tool": "example", "params": {}}'); // ask the client to execute a tool call
await capUI.sendPrompt('Generate something amazing'); // ask the client to send a prompt for the user
```

### React Hook

```jsx
import { useCapUI } from '@nuwa-kit/capui-kit';

function MyComponent() {
  const { sendMessage, sendToolCall, sendPrompt, isConnected } = useCapUI({
    onReceiveMessage: (message) => {
      console.log('Received:', message);
      return 'Processed';
    },
    onError: (error) => console.error(error)
  });

  const handleClick = async () => {
    await sendMessage('Button clicked!');
  };

  return (
    <div>
      <p>Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
      <button onClick={handleClick}>Send Message</button>
    </div>
  );
}
```

#### Nuwa Client Methods

- `sendMessage(message: string): Promise<string>` - Send a message to the client
- `sendToolCall(toolCall: string): Promise<string>` - Send a tool call to the client
- `sendPrompt(prompt: string): Promise<string>` - Send a prompt to the client

| todo: explain the callbacks and the detailed behaviors

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
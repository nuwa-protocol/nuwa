# Cap UI Examples

A comprehensive showcase of the `@nuwa-ai/ui-kit` SDK featuring three different types of Cap UI implementations. Built with Next.js to demonstrate both client-side UI components and MCP endpoint implementations.

## 🌟 Three Example Types

### 1. 🌤️ **Weather App** - Pure UI Illustration

**File:** [`src/pages/WeatherPage.tsx`](./src/pages/WeatherPage.tsx)  
**Type:** Inline UI  
**Communication:** None (pure display)

A simple weather display component that demonstrates basic Cap UI styling and layout patterns. This example shows:

- Basic iframe UI structure
- Responsive design patterns
- Static content display
- No external communication required

**Best for:** Understanding basic Cap UI concepts and styling.

---

### 2. 💬 **Demo App** - Single Direction Communication

**File:** [`src/pages/NuwaClientDemoPage.tsx`](./src/pages/NuwaClientDemoPage.tsx)  
**Type:** Inline UI  
**Communication:** Cap UI → Nuwa Client (one-way)

An interactive demo that calls Nuwa Client functions from the UI. This example demonstrates:

- ✅ Send prompts to AI
- ✅ Add selections to chat
- ✅ Save/retrieve state data
- ✅ Real-time connection status
- ✅ Auto height adjustment

**Features:**

- Tab-based interface (Prompt, Selection, State)
- Connection status indicator
- Error handling and user feedback
- Reactive state management with `useNuwaClient` hook

**Best for:** Learning how to integrate with the Nuwa Client and send data from your UI.

## 🚀 Getting Started

### 🌐 Live Testing (Recommended)

**Try the examples live**  
**🔗 [https://test-app.nuwa.dev/studio/mcp](https://test-app.nuwa.dev/studio/mcp)**

This is the easiest way to explore all three examples and see how they work in a real Nuwa environment.

### 💻 Local Development

### Prerequisites

- Node.js >= 16
- npm/yarn/pnpm

### Installation & Setup

1. **Install dependencies:**

   ```bash
   cd examples/cap-ui
   npm install
   ```

2. **Run development server:**

   ```bash
   npm run dev
   ```

3. **Open in browser:**
   ```
   http://localhost:3000
   ```

### Testing the Examples

#### Weather App

- Navigate to `/weather`
- View the static weather display
- Observe responsive design and styling

#### Demo App

- Navigate to `/demo`
- Test the three tabs: Prompt, Selection, State
- Watch connection status indicator
- Try sending prompts and managing state

## 📁 Project Structure

```
examples/cap-ui/
├── src/
│   ├── pages/
│   │   ├── WeatherPage.tsx     # Pure UI example
│   │   ├── NuwaClientDemoPage.tsx  # Single direction example
│   │   ├── NotePage.tsx        # Bidirectional example
│   │   └── Home.tsx           # Navigation page
│   ├── components/            # Shared components
│   └── styles/               # Styling
├── README.md                 # This file
└── package.json             # Dependencies
```

## Common Patterns

All examples demonstrate these best practices:

- ✅ Proper `containerRef` usage for height adjustment
- ✅ Connection state management
- ✅ Error handling
- ✅ TypeScript integration
- ✅ Responsive design

## 📚 Additional Resources

- **[Main UI Kit Documentation](../../packages/ui-kit/README.md)** - Complete API reference
- **[Nuwa Client Integration Guide](../../packages/ui-kit/README.md#-nuwa-client-integration)** - Learn client communication
- **[MCP Server Setup Guide](../../packages/ui-kit/README.md#-mcp-tool-exposure)** - Implement bidirectional communication

## 🤝 Contributing

These examples are part of the Nuwa AI ecosystem. Improvements and additional examples are welcome!

---

Built with ❤️ by the Nuwa AI team

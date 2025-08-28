import { CapUIParent, DiscoveredTool, AIRequest } from '@nuwa-ai/capui-kit'

/**
 * Example Parent Application using CapUIParent with MCP
 * 
 * This example demonstrates:
 * 1. Connecting to child iframes
 * 2. Handling parent function calls from children
 * 3. Calling child tools from parent AI
 * 4. Multi-child management
 */

// Initialize CapUI parent
const capUIParent = new CapUIParent({
  allowedOrigins: ['*'], // In production, use specific origins
  debug: true,
  
  // Parent function implementations
  onSendPrompt: async (prompt: string, options?: any, origin?: string) => {
    console.log(`Received prompt from ${origin}:`, prompt, options)
    
    // Simulate AI response
    const response = await simulateAIResponse(prompt, options)
    return response
  },
  
  onSendMessage: async (type: string, payload: any, origin?: string) => {
    console.log(`Received message from ${origin}:`, { type, payload })
    
    // Handle different message types
    switch (type) {
      case 'status_update':
        handleStatusUpdate(payload, origin)
        break
      case 'tool_call':
        handleToolCall(payload, origin)
        break
      default:
        console.log('Unknown message type:', type)
    }
  },
  
  onGetContext: async (keys?: string[], origin?: string) => {
    console.log(`Context request from ${origin}:`, keys)
    
    // Return context based on keys
    const context: any = {}
    
    if (!keys || keys.includes('user_preferences')) {
      context.user_preferences = {
        theme: 'dark',
        units: 'celsius',
        language: 'en'
      }
    }
    
    if (!keys || keys.includes('location')) {
      context.location = 'San Francisco, CA'
    }
    
    if (!keys || keys.includes('user_id')) {
      context.user_id = 'user_12345'
    }
    
    return context
  },
  
  // Event handlers
  onChildConnected: (childOrigin: string) => {
    console.log(`Child connected: ${childOrigin}`)
    displayMessage(`Child connected from ${childOrigin}`, 'success')
  },
  
  onChildDisconnected: (childOrigin: string) => {
    console.log(`Child disconnected: ${childOrigin}`)
    displayMessage(`Child disconnected from ${childOrigin}`, 'info')
  },
  
  onToolDiscovered: (tools: DiscoveredTool[]) => {
    console.log('Tools discovered:', tools)
    displayDiscoveredTools(tools)
  },
  
  onError: (error: string) => {
    console.error('CapUIParent error:', error)
    displayMessage(`Error: ${error}`, 'error')
  }
})

// === AI Simulation ===

async function simulateAIResponse(prompt: string, options: any = {}) {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // Simple pattern matching for demo
  let content = ''
  
  if (prompt.toLowerCase().includes('weather')) {
    content = "I can help you with weather information! The child component should have weather tools available that I can use to get current conditions and forecasts."
  } else if (prompt.toLowerCase().includes('location')) {
    content = "I can help you select or get information about locations. There should be location-related tools available."
  } else {
    content = `I received your prompt: "${prompt}". I can help you by using the available tools from the child components.`
  }
  
  return {
    content,
    streaming: options.streaming || false,
    model: options.model || 'demo-ai',
    usage: {
      prompt_tokens: prompt.length / 4, // Rough estimate
      completion_tokens: content.length / 4,
      total_tokens: (prompt.length + content.length) / 4
    }
  }
}

// === Child Management ===

const connectedChildren = new Map<string, HTMLIFrameElement>()

async function addChildIframe(src: string, childOrigin: string = '*') {
  try {
    const iframe = document.createElement('iframe')
    iframe.src = src
    iframe.style.width = '100%'
    iframe.style.height = '400px'
    iframe.style.border = '1px solid #ddd'
    iframe.style.borderRadius = '8px'
    
    // Wait for iframe to load
    await new Promise((resolve) => {
      iframe.onload = resolve
    })
    
    // Connect to child
    await capUIParent.connectToChild(iframe, childOrigin)
    
    // Store reference
    connectedChildren.set(src, iframe)
    
    // Add to DOM
    const container = document.getElementById('children-container')
    if (container) {
      const childDiv = document.createElement('div')
      childDiv.className = 'child-container'
      childDiv.innerHTML = `
        <div class="child-header">
          <h3>Child: ${src}</h3>
          <button onclick="removeChild('${src}')">Remove</button>
        </div>
      `
      childDiv.appendChild(iframe)
      container.appendChild(childDiv)
    }
    
    displayMessage(`Added child iframe: ${src}`, 'success')
    
  } catch (error) {
    console.error('Failed to add child iframe:', error)
    displayMessage(`Failed to add child: ${error.message}`, 'error')
  }
}

async function removeChild(src: string) {
  const iframe = connectedChildren.get(src)
  if (!iframe) return
  
  try {
    await capUIParent.disconnectFromChild(iframe)
    connectedChildren.delete(src)
    
    // Remove from DOM
    const childDiv = iframe.closest('.child-container')
    if (childDiv) {
      childDiv.remove()
    }
    
    displayMessage(`Removed child: ${src}`, 'info')
    
  } catch (error) {
    console.error('Failed to remove child:', error)
    displayMessage(`Failed to remove child: ${error.message}`, 'error')
  }
}

// === Tool Testing ===

async function testChildTool(toolName: string, params: any) {
  try {
    displayMessage(`Testing tool: ${toolName}`, 'info')
    
    const request: AIRequest = {
      toolName,
      arguments: params,
      requestId: `test-${Date.now()}`
    }
    
    const response = await capUIParent.routeAIRequest(request)
    
    if (response.success) {
      displayMessage(`Tool ${toolName} succeeded`, 'success')
      console.log('Tool result:', response.content)
      displayToolResult(toolName, response.content)
    } else {
      displayMessage(`Tool ${toolName} failed: ${response.error}`, 'error')
    }
    
  } catch (error) {
    console.error('Tool test failed:', error)
    displayMessage(`Tool test failed: ${error.message}`, 'error')
  }
}

// === AI Workflow Simulation ===

async function simulateAIWorkflow() {
  try {
    displayMessage('Starting AI workflow simulation...', 'info')
    
    // Step 1: Get weather data
    await testChildTool('get_weather_data', {
      location: 'San Francisco',
      units: 'celsius'
    })
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Step 2: Generate chart
    await testChildTool('generate_weather_chart', {
      location: 'San Francisco',
      days: 5
    })
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Step 3: Test location picker
    await testChildTool('pick_location', {
      defaultLocation: 'New York'
    })
    
    displayMessage('AI workflow completed!', 'success')
    
  } catch (error) {
    console.error('AI workflow failed:', error)
    displayMessage(`AI workflow failed: ${error.message}`, 'error')
  }
}

// === UI Functions ===

function displayMessage(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const messageDiv = document.createElement('div')
  messageDiv.className = `message ${type}`
  messageDiv.textContent = message
  
  const container = document.getElementById('messages')
  if (container) {
    container.appendChild(messageDiv)
    container.scrollTop = container.scrollHeight
  }
  
  // Auto remove after 10 seconds
  setTimeout(() => messageDiv.remove(), 10000)
}

function displayDiscoveredTools(tools: DiscoveredTool[]) {
  const toolsDiv = document.getElementById('discovered-tools')
  if (toolsDiv) {
    toolsDiv.innerHTML = `
      <h3>Discovered Tools (${tools.length})</h3>
      ${tools.map(tool => `
        <div class="tool-item">
          <div class="tool-header">
            <strong>${tool.name}</strong>
            <button onclick="showToolDetails('${tool.name}')">Details</button>
          </div>
          <p>${tool.description}</p>
          <div class="tool-actions">
            <button onclick="quickTestTool('${tool.name}')">Quick Test</button>
          </div>
        </div>
      `).join('')}
    `
  }
}

function displayToolResult(toolName: string, result: any) {
  const resultsDiv = document.getElementById('tool-results')
  if (resultsDiv) {
    const resultDiv = document.createElement('div')
    resultDiv.className = 'tool-result'
    resultDiv.innerHTML = `
      <h4>Result from ${toolName}:</h4>
      <pre>${JSON.stringify(result, null, 2)}</pre>
    `
    resultsDiv.appendChild(resultDiv)
  }
}

function showToolDetails(toolName: string) {
  const tools = capUIParent.getAllChildTools()
  const tool = tools.flatMap(t => t.tools).find(t => t.name === toolName)
  
  if (tool) {
    alert(`Tool: ${tool.name}\n\nDescription: ${tool.description}\n\nSchema:\n${JSON.stringify(tool.inputSchema, null, 2)}`)
  }
}

function quickTestTool(toolName: string) {
  // Quick test with default parameters based on tool name
  let params = {}
  
  switch (toolName) {
    case 'get_weather_data':
      params = { location: 'New York', units: 'celsius' }
      break
    case 'generate_weather_chart':
      params = { location: 'London', days: 3 }
      break
    case 'pick_location':
      params = { defaultLocation: 'Tokyo' }
      break
    default:
      params = {}
  }
  
  testChildTool(toolName, params)
}

function updateStats() {
  const stats = capUIParent.getStats()
  const statsDiv = document.getElementById('stats')
  if (statsDiv) {
    statsDiv.innerHTML = `
      <h3>Statistics</h3>
      <p>Connected Children: ${stats.connectedChildren}</p>
      <p>Total Tools: ${stats.totalTools}</p>
      <div class="connections">
        ${stats.connections.map(conn => `
          <div class="connection-item">
            <strong>${conn.origin}</strong> - ${conn.toolCount} tools - ${conn.isReady ? 'Ready' : 'Not Ready'}
          </div>
        `).join('')}
      </div>
    `
  }
}

// === Setup ===

document.addEventListener('DOMContentLoaded', () => {
  document.body.innerHTML = `
    <div class="parent-demo">
      <h1>CapUI Parent MCP Demo</h1>
      
      <div class="controls">
        <h2>Child Management</h2>
        <div class="control-group">
          <input id="iframe-src" type="text" placeholder="Child iframe src (e.g., child-demo.html)" 
                 value="child-demo.html" />
          <button onclick="addChildFromInput()">Add Child Iframe</button>
        </div>
        <div class="control-group">
          <button onclick="simulateAIWorkflow()">Simulate AI Workflow</button>
          <button onclick="updateStats()">Update Stats</button>
        </div>
      </div>
      
      <div class="content">
        <div class="left-panel">
          <div id="stats" class="stats-panel"></div>
          <div id="discovered-tools" class="tools-panel"></div>
          <div id="messages" class="messages-panel">
            <h3>Messages</h3>
          </div>
        </div>
        
        <div class="right-panel">
          <div id="children-container" class="children-container">
            <h3>Connected Children</h3>
          </div>
          <div id="tool-results" class="tool-results">
            <h3>Tool Results</h3>
          </div>
        </div>
      </div>
    </div>
    
    <style>
      .parent-demo { padding: 20px; font-family: Arial, sans-serif; }
      .controls { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
      .control-group { margin: 10px 0; }
      .control-group input { padding: 8px; margin-right: 10px; width: 300px; }
      .control-group button { padding: 8px 16px; margin-right: 10px; cursor: pointer; }
      
      .content { display: flex; gap: 20px; }
      .left-panel { flex: 1; }
      .right-panel { flex: 2; }
      
      .stats-panel, .tools-panel, .messages-panel, .children-container, .tool-results {
        margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;
      }
      
      .messages-panel { height: 200px; overflow-y: auto; }
      .tool-results { height: 300px; overflow-y: auto; }
      
      .message { padding: 8px; margin: 5px 0; border-radius: 4px; }
      .message.info { background: #e3f2fd; }
      .message.success { background: #e8f5e8; }
      .message.error { background: #ffebee; }
      
      .tool-item { margin: 10px 0; padding: 10px; border: 1px solid #eee; border-radius: 4px; }
      .tool-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
      .tool-actions { margin-top: 10px; }
      .tool-actions button { margin-right: 10px; padding: 4px 8px; font-size: 12px; }
      
      .child-container { margin: 15px 0; }
      .child-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      
      .tool-result { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
      .tool-result pre { margin: 0; white-space: pre-wrap; }
      
      .connection-item { padding: 5px; margin: 5px 0; background: #f9f9f9; border-radius: 4px; }
    </style>
  `
  
  // Make functions global
  window.addChildFromInput = () => {
    const input = document.getElementById('iframe-src') as HTMLInputElement
    if (input.value) {
      addChildIframe(input.value)
    }
  }
  
  window.removeChild = removeChild
  window.simulateAIWorkflow = simulateAIWorkflow
  window.updateStats = updateStats
  window.showToolDetails = showToolDetails
  window.quickTestTool = quickTestTool
  
  // Initial stats update
  updateStats()
  
  displayMessage('CapUI Parent initialized and ready to connect to children!', 'success')
})

// === Message Handlers ===

function handleStatusUpdate(payload: any, origin?: string) {
  displayMessage(`Status update from ${origin}: ${payload.component} is ${payload.status}`, 'info')
}

function handleToolCall(payload: any, origin?: string) {
  displayMessage(`Tool call from ${origin}: ${JSON.stringify(payload)}`, 'info')
}
import { CapUI, ChildToolDefinition } from '@nuwa-ai/capui-kit'

/**
 * Example Child Application using CapUI with MCP
 * 
 * This example demonstrates:
 * 1. Direct parent function calls (sendPrompt, sendMessage, getContext)
 * 2. Tool registration for parent AI to use
 * 3. Resource registration
 */

// Initialize CapUI child SDK
const capUI = new CapUI({
  parentOrigin: '*', // In production, use specific origin
  debug: true,
  serverInfo: {
    name: 'Weather-Demo-Child',
    version: '1.0.0'
  }
})

// === Direct Parent Function Calls ===

// Example 1: Send prompt to parent AI
async function askAI() {
  try {
    const response = await capUI.sendPrompt(
      'What is the current weather like?',
      { 
        streaming: false,
        temperature: 0.7 
      }
    )
    
    console.log('AI Response:', response)
    displayMessage(`AI says: ${response.content}`)
    
  } catch (error) {
    console.error('Failed to get AI response:', error)
    displayMessage(`Error: ${error.message}`, 'error')
  }
}

// Example 2: Send message to parent
async function notifyParent() {
  try {
    await capUI.sendMessage('status_update', {
      component: 'weather-widget',
      status: 'ready',
      timestamp: new Date().toISOString()
    })
    
    console.log('Notified parent successfully')
    
  } catch (error) {
    console.error('Failed to notify parent:', error)
  }
}

// Example 3: Get context from parent
async function getParentContext() {
  try {
    const context = await capUI.getContext(['user_preferences', 'location'])
    console.log('Parent context:', context)
    
    if (context.location) {
      displayMessage(`Your location: ${context.location}`)
    }
    
  } catch (error) {
    console.error('Failed to get context:', error)
  }
}

// === Tool Registration for Parent AI ===

// Tool 1: Get weather data
const getWeatherTool: ChildToolDefinition = {
  name: 'get_weather_data',
  description: 'Get current weather data for a location',
  schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The location to get weather for'
      },
      units: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature units'
      }
    },
    required: ['location']
  },
  handler: async (params) => {
    const { location, units = 'celsius' } = params
    
    // Simulate API call
    const weatherData = {
      location,
      temperature: units === 'celsius' ? 22 : 72,
      condition: 'Sunny',
      humidity: 65,
      windSpeed: 10,
      units
    }
    
    // Update UI
    displayWeatherData(weatherData)
    
    return {
      success: true,
      data: weatherData
    }
  }
}

// Tool 2: Generate weather chart
const generateWeatherChartTool: ChildToolDefinition = {
  name: 'generate_weather_chart',
  description: 'Generate a weather chart for a location',
  schema: {
    type: 'object',
    properties: {
      location: { type: 'string' },
      days: { type: 'number', minimum: 1, maximum: 7 }
    },
    required: ['location']
  },
  handler: async (params) => {
    const { location, days = 5 } = params
    
    // Generate mock chart data
    const chartData = Array.from({ length: days }, (_, i) => ({
      day: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toLocaleDateString(),
      temperature: 20 + Math.random() * 10,
      condition: ['Sunny', 'Cloudy', 'Rainy'][Math.floor(Math.random() * 3)]
    }))
    
    // Display chart
    displayChart(chartData)
    
    return {
      success: true,
      data: {
        location,
        chartData,
        chartUrl: 'capui://resource/weather-chart'
      }
    }
  }
}

// Tool 3: Interactive location picker
const locationPickerTool: ChildToolDefinition = {
  name: 'pick_location',
  description: 'Show interactive location picker UI',
  schema: {
    type: 'object',
    properties: {
      defaultLocation: { type: 'string' }
    }
  },
  handler: async (params) => {
    return new Promise((resolve) => {
      showLocationPicker(params.defaultLocation, (selectedLocation) => {
        resolve({
          success: true,
          data: { selectedLocation }
        })
      })
    })
  }
}

// Register all tools
capUI.registerTool(getWeatherTool)
capUI.registerTool(generateWeatherChartTool)
capUI.registerTool(locationPickerTool)

// Register a resource (weather chart)
capUI.registerResource(
  'capui://resource/weather-chart',
  '<svg><!-- Weather chart SVG --></svg>',
  'image/svg+xml'
)

// === UI Functions ===

function displayMessage(message: string, type: 'info' | 'error' = 'info') {
  const messageDiv = document.createElement('div')
  messageDiv.className = `message ${type}`
  messageDiv.textContent = message
  
  const container = document.getElementById('messages') || document.body
  container.appendChild(messageDiv)
  
  // Auto remove after 5 seconds
  setTimeout(() => messageDiv.remove(), 5000)
}

function displayWeatherData(data: any) {
  const weatherDiv = document.getElementById('weather-data')
  if (weatherDiv) {
    weatherDiv.innerHTML = `
      <h3>Weather for ${data.location}</h3>
      <p>Temperature: ${data.temperature}°${data.units === 'celsius' ? 'C' : 'F'}</p>
      <p>Condition: ${data.condition}</p>
      <p>Humidity: ${data.humidity}%</p>
      <p>Wind Speed: ${data.windSpeed} km/h</p>
    `
  }
}

function displayChart(chartData: any[]) {
  const chartDiv = document.getElementById('weather-chart')
  if (chartDiv) {
    chartDiv.innerHTML = `
      <h3>Weather Forecast</h3>
      <div class="chart">
        ${chartData.map(day => `
          <div class="chart-day">
            <div>${day.day}</div>
            <div>${Math.round(day.temperature)}°C</div>
            <div>${day.condition}</div>
          </div>
        `).join('')}
      </div>
    `
  }
}

function showLocationPicker(defaultLocation: string, onSelect: (location: string) => void) {
  const locations = ['New York', 'London', 'Tokyo', 'Sydney', 'Paris']
  
  const picker = document.createElement('div')
  picker.className = 'location-picker'
  picker.innerHTML = `
    <h3>Select Location</h3>
    <select id="location-select">
      ${locations.map(loc => `
        <option value="${loc}" ${loc === defaultLocation ? 'selected' : ''}>${loc}</option>
      `).join('')}
    </select>
    <button onclick="confirmLocation()">Confirm</button>
    <button onclick="cancelLocationPicker()">Cancel</button>
  `
  
  document.body.appendChild(picker)
  
  // Global functions for buttons
  window.confirmLocation = () => {
    const select = document.getElementById('location-select') as HTMLSelectElement
    onSelect(select.value)
    picker.remove()
  }
  
  window.cancelLocationPicker = () => {
    picker.remove()
  }
}

// === Demo UI Setup ===

document.addEventListener('DOMContentLoaded', () => {
  document.body.innerHTML = `
    <div class="demo-container">
      <h1>CapUI MCP Weather Demo</h1>
      
      <div class="section">
        <h2>Direct Parent Function Calls</h2>
        <button onclick="askAI()">Ask AI about weather</button>
        <button onclick="notifyParent()">Notify Parent</button>
        <button onclick="getParentContext()">Get Context</button>
      </div>
      
      <div class="section">
        <h2>Registered Tools (Available to Parent AI)</h2>
        <p>The following tools are registered and can be called by the parent AI:</p>
        <ul>
          <li><strong>get_weather_data</strong>: Get current weather for a location</li>
          <li><strong>generate_weather_chart</strong>: Generate weather forecast chart</li>
          <li><strong>pick_location</strong>: Interactive location picker</li>
        </ul>
      </div>
      
      <div id="messages" class="messages"></div>
      <div id="weather-data" class="weather-data"></div>
      <div id="weather-chart" class="weather-chart"></div>
    </div>
    
    <style>
      .demo-container { padding: 20px; font-family: Arial, sans-serif; }
      .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
      button { margin: 5px; padding: 8px 16px; cursor: pointer; }
      .message { padding: 10px; margin: 5px 0; border-radius: 4px; }
      .message.info { background: #e3f2fd; border-left: 4px solid #2196f3; }
      .message.error { background: #ffebee; border-left: 4px solid #f44336; }
      .chart { display: flex; gap: 10px; }
      .chart-day { text-align: center; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
      .location-picker { 
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: white; padding: 20px; border: 2px solid #333; border-radius: 8px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      }
    </style>
  `
  
  // Make functions global for button access
  window.askAI = askAI
  window.notifyParent = notifyParent  
  window.getParentContext = getParentContext
  
  // Display connection status
  displayMessage(`CapUI initialized. Connection status: ${capUI.isConnectedToParent}`, 'info')
  
  // Show stats
  console.log('CapUI Stats:', capUI.getStats())
})
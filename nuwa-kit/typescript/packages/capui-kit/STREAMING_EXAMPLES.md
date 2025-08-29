# Streaming Support Examples

This document demonstrates how to use the streaming capabilities in CapUI Kit for real-time AI responses.

## Overview

CapUI Kit supports both traditional request/response patterns and real-time streaming for AI interactions. Streaming is particularly useful for:

- Real-time AI chat interfaces
- Progressive content generation
- Live data processing
- Immediate user feedback during long operations

## Basic Streaming Setup

### Parent Application (AI Host)

```typescript
import { CapUIMCPParent, StreamingAIResponse } from '@capui/kit'

const parent = new CapUIMCPParent({
  allowedOrigins: ['https://child.example.com'],
  debug: true,
  
  // Handle streaming prompt requests from children
  onSendPromptStreaming: async (prompt, options, origin) => {
    const { streamId } = options
    console.log(`Starting stream ${streamId} for prompt:`, prompt)
    
    try {
      // Send streaming start event
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_start',
        content: '',
        model: options.model || 'gpt-4'
      })
      
      // Simulate AI streaming response (replace with actual AI API)
      await simulateAIStreaming(prompt, {
        model: options.model,
        temperature: options.temperature,
        onChunk: (chunk) => {
          // Send each chunk to child
          parent.sendStreamingResponse(streamId, {
            id: streamId,
            type: 'streaming_chunk',
            content: chunk,
            model: options.model || 'gpt-4'
          })
        },
        onComplete: (finalContent, usage) => {
          // Send completion event
          parent.sendStreamingResponse(streamId, {
            id: streamId,
            type: 'streaming_end',
            content: '', // Final chunk already sent
            model: options.model || 'gpt-4',
            usage
          })
        },
        onError: (error) => {
          // Send error event
          parent.sendStreamingResponse(streamId, {
            id: streamId,
            type: 'streaming_error',
            error: error.message
          })
        }
      })
      
    } catch (error) {
      // Handle any setup errors
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
})

// Simulate AI streaming (replace with real AI API like OpenAI)
async function simulateAIStreaming(
  prompt: string, 
  options: {
    model?: string
    temperature?: number
    onChunk: (chunk: string) => void
    onComplete: (finalContent: string, usage: any) => void
    onError: (error: Error) => void
  }
) {
  const response = "This is a simulated streaming response that will be sent in chunks..."
  const chunks = response.split(' ')
  
  let fullContent = ''
  
  for (let i = 0; i < chunks.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 100)) // Simulate delay
    const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '')
    fullContent += chunk
    options.onChunk(chunk)
  }
  
  options.onComplete(fullContent, {
    prompt_tokens: 10,
    completion_tokens: chunks.length,
    total_tokens: 10 + chunks.length
  })
}
```

### Child Application (UI Component)

```typescript
import { CapUIMCP, StreamingAIResponse } from '@capui/kit'

const capui = new CapUIMCP({
  parentOrigin: 'https://parent.example.com',
  debug: true
})

// Example: Chat interface with streaming
class StreamingChatInterface {
  private chatContainer: HTMLElement
  private currentMessageElement: HTMLElement | null = null
  private currentContent = ''
  
  constructor(container: HTMLElement) {
    this.chatContainer = container
    this.setupUI()
  }
  
  private setupUI() {
    const input = document.createElement('input')
    const button = document.createElement('button')
    
    input.placeholder = 'Type your message...'
    button.textContent = 'Send'
    
    button.onclick = () => this.sendMessage(input.value)
    
    this.chatContainer.appendChild(input)
    this.chatContainer.appendChild(button)
  }
  
  private async sendMessage(message: string) {
    if (!message.trim()) return
    
    // Add user message to chat
    this.addMessage('user', message)
    
    // Add assistant message container
    this.currentMessageElement = this.addMessage('assistant', '')
    this.currentContent = ''
    
    try {
      // Start streaming request
      const streamId = await capui.sendPromptStreaming(message, {
        streaming: true,
        model: 'gpt-4',
        temperature: 0.7,
        
        onChunk: (response: StreamingAIResponse) => {
          this.handleStreamingChunk(response)
        },
        
        onComplete: (finalResponse) => {
          console.log('Streaming complete:', finalResponse)
          this.handleStreamingComplete(finalResponse)
        },
        
        onError: (error) => {
          console.error('Streaming error:', error)
          this.handleStreamingError(error)
        }
      })
      
      console.log('Started streaming with ID:', streamId)
      
    } catch (error) {
      console.error('Failed to start streaming:', error)
      this.handleStreamingError(error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  private handleStreamingChunk(response: StreamingAIResponse) {
    if (response.type === 'streaming_chunk' && response.content) {
      this.currentContent += response.content
      if (this.currentMessageElement) {
        this.currentMessageElement.textContent = this.currentContent
        
        // Auto-scroll to bottom
        this.currentMessageElement.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }
  
  private handleStreamingComplete(finalResponse: any) {
    if (this.currentMessageElement) {
      this.currentMessageElement.classList.add('complete')
      
      // Show token usage if available
      if (finalResponse.usage) {
        const usage = document.createElement('small')
        usage.textContent = `Tokens: ${finalResponse.usage.total_tokens}`
        usage.className = 'token-usage'
        this.currentMessageElement.appendChild(usage)
      }
    }
    
    this.currentMessageElement = null
    this.currentContent = ''
  }
  
  private handleStreamingError(error: string) {
    if (this.currentMessageElement) {
      this.currentMessageElement.textContent = `Error: ${error}`
      this.currentMessageElement.classList.add('error')
    }
    
    this.currentMessageElement = null
    this.currentContent = ''
  }
  
  private addMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    const messageDiv = document.createElement('div')
    messageDiv.className = \`message \${role}\`
    messageDiv.textContent = content
    
    this.chatContainer.appendChild(messageDiv)
    return messageDiv
  }
}

// Initialize chat interface
const chatContainer = document.getElementById('chat-container')!
const chat = new StreamingChatInterface(chatContainer)
```

## OpenAI Integration Example

Here's how to integrate with OpenAI's streaming API:

```typescript
import OpenAI from 'openai'
import { CapUIMCPParent } from '@capui/kit'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const parent = new CapUIMCPParent({
  onSendPromptStreaming: async (prompt, options, origin) => {
    const { streamId, model = 'gpt-4', temperature = 0.7 } = options
    
    try {
      // Send streaming start event
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_start',
        model
      })
      
      // Create OpenAI streaming request
      const stream = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        stream: true
      })
      
      let fullContent = ''
      
      // Process streaming chunks
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        
        if (content) {
          fullContent += content
          
          // Send chunk to child
          parent.sendStreamingResponse(streamId, {
            id: streamId,
            type: 'streaming_chunk',
            content,
            model
          })
        }
        
        // Check if streaming is complete
        if (chunk.choices[0]?.finish_reason) {
          // Send completion event
          parent.sendStreamingResponse(streamId, {
            id: streamId,
            type: 'streaming_end',
            model,
            usage: {
              prompt_tokens: chunk.usage?.prompt_tokens || 0,
              completion_tokens: chunk.usage?.completion_tokens || 0,
              total_tokens: chunk.usage?.total_tokens || 0
            }
          })
          break
        }
      }
      
    } catch (error) {
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_error',
        error: error instanceof Error ? error.message : 'OpenAI API error'
      })
    }
  }
})
```

## Claude API Integration Example

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { CapUIMCPParent } from '@capui/kit'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const parent = new CapUIMCPParent({
  onSendPromptStreaming: async (prompt, options, origin) => {
    const { streamId, model = 'claude-3-sonnet-20240229', temperature = 0.7 } = options
    
    try {
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_start',
        model
      })
      
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 4000,
        temperature,
        messages: [{ role: 'user', content: prompt }]
      })
      
      stream.on('text', (text) => {
        parent.sendStreamingResponse(streamId, {
          id: streamId,
          type: 'streaming_chunk',
          content: text,
          model
        })
      })
      
      stream.on('end', () => {
        parent.sendStreamingResponse(streamId, {
          id: streamId,
          type: 'streaming_end',
          model
        })
      })
      
      stream.on('error', (error) => {
        parent.sendStreamingResponse(streamId, {
          id: streamId,
          type: 'streaming_error',
          error: error.message
        })
      })
      
    } catch (error) {
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_error',
        error: error instanceof Error ? error.message : 'Claude API error'
      })
    }
  }
})
```

## Advanced Streaming Features

### Multiple Concurrent Streams

```typescript
// Parent can handle multiple concurrent streams
const activeStreams = new Map()

const parent = new CapUIMCPParent({
  onSendPromptStreaming: async (prompt, options, origin) => {
    const { streamId } = options
    
    // Track active streams
    activeStreams.set(streamId, {
      prompt,
      startTime: Date.now(),
      origin
    })
    
    // ... handle streaming
    
    // Clean up when done
    stream.on('end', () => {
      activeStreams.delete(streamId)
    })
  }
})

// Monitor active streams
setInterval(() => {
  console.log('Active streams:', activeStreams.size)
  activeStreams.forEach((stream, id) => {
    const duration = Date.now() - stream.startTime
    console.log(\`Stream \${id}: \${duration}ms, origin: \${stream.origin}\`)
  })
}, 5000)
```

### Stream Cancellation

```typescript
// Child: Cancel ongoing stream
class CancellableChat {
  private activeStreamId: string | null = null
  
  async sendMessage(message: string) {
    // Cancel previous stream if active
    if (this.activeStreamId) {
      await this.cancelStream(this.activeStreamId)
    }
    
    // Start new stream
    this.activeStreamId = await capui.sendPromptStreaming(message, {
      streaming: true,
      onComplete: () => {
        this.activeStreamId = null
      },
      onError: () => {
        this.activeStreamId = null
      }
    })
  }
  
  async cancelStream(streamId: string) {
    // Send cancellation message to parent
    await capui.sendMessage('cancel_stream', { streamId })
    this.activeStreamId = null
  }
}

// Parent: Handle cancellation
const parent = new CapUIMCPParent({
  onSendMessage: async (type, payload, origin) => {
    if (type === 'cancel_stream') {
      const { streamId } = payload
      
      // Clean up stream
      if (activeStreams.has(streamId)) {
        // Cancel ongoing AI request if possible
        const streamInfo = activeStreams.get(streamId)
        if (streamInfo.controller) {
          streamInfo.controller.abort()
        }
        
        activeStreams.delete(streamId)
        
        // Send cancellation confirmation
        parent.sendStreamingResponse(streamId, {
          id: streamId,
          type: 'streaming_error',
          error: 'Cancelled by user'
        })
      }
    }
  }
})
```

### Stream with Progress Indicators

```typescript
// Child: Show progress during streaming
class ProgressiveChat {
  private progressBar: HTMLElement
  private estimatedTokens = 1000 // Estimate based on prompt
  private receivedTokens = 0
  
  async sendMessage(message: string) {
    this.receivedTokens = 0
    this.showProgress(0)
    
    await capui.sendPromptStreaming(message, {
      streaming: true,
      onChunk: (response) => {
        if (response.content) {
          // Rough token estimation (1 token ≈ 4 characters)
          this.receivedTokens += Math.ceil(response.content.length / 4)
          const progress = Math.min(this.receivedTokens / this.estimatedTokens, 1)
          this.showProgress(progress)
        }
      },
      onComplete: (finalResponse) => {
        this.showProgress(1)
        if (finalResponse.usage) {
          // Update with actual token count
          console.log('Actual tokens:', finalResponse.usage.completion_tokens)
        }
      }
    })
  }
  
  private showProgress(percent: number) {
    this.progressBar.style.width = \`\${percent * 100}%\`
  }
}
```

## Error Handling

```typescript
// Robust error handling for streaming
const parent = new CapUIMCPParent({
  onSendPromptStreaming: async (prompt, options, origin) => {
    const { streamId } = options
    let cleanup = () => {}
    
    try {
      // Set up error recovery
      const timeoutId = setTimeout(() => {
        parent.sendStreamingResponse(streamId, {
          id: streamId,
          type: 'streaming_error',
          error: 'Request timeout after 60 seconds'
        })
      }, 60000)
      
      cleanup = () => clearTimeout(timeoutId)
      
      // Your streaming implementation here
      await handleStreamingRequest(prompt, options)
      
    } catch (error) {
      // Always send error event
      parent.sendStreamingResponse(streamId, {
        id: streamId,
        type: 'streaming_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    } finally {
      cleanup()
    }
  }
})
```

## Performance Tips

1. **Buffer Management**: Don't accumulate large buffers in memory
2. **Rate Limiting**: Implement reasonable rate limits for streaming requests
3. **Connection Monitoring**: Monitor and clean up stale connections
4. **Chunk Size**: Optimize chunk sizes for your use case (too small = overhead, too large = delay)
5. **Error Recovery**: Implement retry logic for failed streams

## Troubleshooting

### Common Issues

1. **Stream Not Starting**: Check that `onSendPromptStreaming` is properly configured
2. **Missing Chunks**: Verify that all chunk events are being sent
3. **Memory Leaks**: Ensure streams are properly cleaned up on completion/error
4. **Race Conditions**: Handle multiple concurrent streams carefully

### Debug Mode

Enable debug mode to see detailed streaming logs:

```typescript
const parent = new CapUIMCPParent({ debug: true })
const child = new CapUIMCP({ debug: true })
```

This will show all streaming events, message flows, and timing information in the console.
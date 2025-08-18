import { describe, test, expect } from '@jest/globals';
import { ToolRegistry, StateMetadata, StateValueWithMetadata } from '../src/tools.js';
import { NuwaValue } from '../src/values.js';

describe('ToolRegistry State Metadata Tests', () => {
  
  // Helper function to create state with metadata
  function createState<T extends NuwaValue>(
    value: T, 
    description: string, 
    formatter?: (value: NuwaValue) => string
  ): StateValueWithMetadata {
    return {
      value,
      metadata: {
        description,
        formatter
      }
    };
  }

  test('should set and get state with metadata', () => {
    const registry = new ToolRegistry();
    
    // Method 1: Using StateValueWithMetadata
    const priceWithMetadata = createState(
      68500.75,
      "The most recent Bitcoin price in USD",
      (value) => `$${value} USD`
    );
    registry.setState('btc_price', priceWithMetadata);
    
    // Method 2: Setting state and metadata separately
    registry.setState('user_id', 'user123');
    registry.registerStateMetadata('user_id', {
      description: "The user's unique identifier"
    });
    
    // Verify values are stored correctly
    expect(registry.getStateValue('btc_price')).toBe(68500.75);
    expect(registry.getStateValue('user_id')).toBe('user123');
    
    // Verify formatStateForPrompt includes metadata
    const promptState = registry.formatStateForPrompt();
    expect(promptState).toContain('btc_price');
    expect(promptState).toContain('The most recent Bitcoin price in USD');
    expect(promptState).toContain('$68500.75 USD');
    expect(promptState).toContain('user_id');
    expect(promptState).toContain("The user's unique identifier");
  });
  
  test('should handle datetime formatting in state', () => {
    const registry = new ToolRegistry();
    const timestamp = 1625097600000; // 2021-07-01T00:00:00.000Z
    
    // Method 1: Using metadata formatter
    const timeWithMetadata = createState(
      timestamp,
      "The time of the last user interaction",
      (value) => {
        const date = new Date(value as number);
        return `${value} (${date.toISOString()})`;
      }
    );
    registry.setState('last_interaction_time', timeWithMetadata);
    
    // Method 2: Using default formatter for timestamps
    registry.setState('created_time', timestamp);
    
    // Verify formatting
    const promptState = registry.formatStateForPrompt();
    expect(promptState).toContain('last_interaction_time');
    expect(promptState).toContain('2021-07-01T00:00:00.000Z');
    expect(promptState).toContain('created_time');
    // Default formatter for keys ending with _time should also format
    expect(promptState).toContain('2021-07-01T00:00:00.000Z');
  });
  
  test('should clear state including metadata', () => {
    const registry = new ToolRegistry();
    
    registry.setState('test_key', 'test_value');
    registry.registerStateMetadata('test_key', {
      description: "Test state value"
    });
    
    expect(registry.hasState('test_key')).toBe(true);
    
    registry.clearState();
    
    expect(registry.hasState('test_key')).toBe(false);
    expect(registry.formatStateForPrompt()).toBe("No state information available.");
  });
  
  test('should be able to update state while preserving metadata', () => {
    const registry = new ToolRegistry();
    
    // Set initial state with metadata
    const initialState = createState(
      100,
      "Counter value"
    );
    registry.setState('counter', initialState);
    
    // Update state value only
    registry.setState('counter', 200);
    
    // Verify metadata is preserved
    const promptState = registry.formatStateForPrompt();
    expect(promptState).toContain('counter: 200');
    expect(promptState).toContain('Counter value');
  });
}); 
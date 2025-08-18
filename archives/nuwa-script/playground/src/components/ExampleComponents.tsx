import React, { memo } from 'react';
import DrawingCanvas from './DrawingCanvas';
import TradingDashboard from './trading/TradingDashboard';

// Constants for custom component IDs
export const COMPONENT_IDS = {
  CANVAS: 'canvas',
  TRADING_DASHBOARD: 'trading_dashboard',
};

// Disable ts check because we need to handle different types of component props
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = React.ComponentType<any>;

// Define component mapping with memoized components for better performance
const componentMap: Record<string, AnyComponent> = {
  [COMPONENT_IDS.CANVAS]: DrawingCanvas, // DrawingCanvas is already memoized
  [COMPONENT_IDS.TRADING_DASHBOARD]: memo(TradingDashboard), // Memoize TradingDashboard
};

// Cache for memoized rendered components to prevent unnecessary re-renders
const componentCache: Record<string, React.ReactNode> = {};

/**
 * Render component based on component ID
 * @param componentId Component ID
 * @param props Component properties
 * @returns Rendered component
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const renderExampleComponent = (componentId: string, props: any = {}) => {
  const Component = componentMap[componentId];
  
  if (!Component) {
    console.warn(`No component found for ID: ${componentId}`);
    return null;
  }
  
  // Create a cache key based on componentId and serialized props
  // Only re-render if the component id or props actually change
  const cacheKey = `${componentId}-${JSON.stringify(props)}`;
  
  if (!componentCache[cacheKey]) {
    componentCache[cacheKey] = <Component {...props} />;
    console.log(`[ExampleComponents] Rendering component ${componentId} with props:`, props);
  }
  
  return componentCache[cacheKey];
};

export default componentMap;
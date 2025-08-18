import { z } from 'zod';
import type { ToolRegistry /*, JsonValue*/ } from '../services/interpreter';
import type { DrawableShape } from '../components/DrawingCanvas';

// Import necessary state and functions from canvas.ts
import {
    canvasShapes,
    notifyCanvasChange,
    updateCanvasJSON,
    // Remove unused canvasJSON import
    // canvasJSON 
} from './canvas';

// --- Zod Schemas for Canvas Tools ---

const drawLineParams = z.object({
  x1: z.number().describe('Starting X coordinate'),
  y1: z.number().describe('Starting Y coordinate'),
  x2: z.number().describe('Ending X coordinate'),
  y2: z.number().describe('Ending Y coordinate'),
  color: z.string().optional().default('black').describe('Line color (e.g., "red", "#00ff00")'),
  width: z.number().optional().default(2).describe('Line width')
});

const drawRectParams = z.object({
    x: z.number().describe('Top-left X coordinate'),
    y: z.number().describe('Top-left Y coordinate'),
    width: z.number().describe('Rectangle width'),
    height: z.number().describe('Rectangle height'),
    color: z.string().optional().default('black').describe('Border color'),
    fill: z.string().optional().describe('Fill color (optional)')
});

const drawCircleParams = z.object({
    x: z.number().describe('Center X coordinate'),
    y: z.number().describe('Center Y coordinate'),
    radius: z.number().describe('Circle radius'),
    color: z.string().optional().default('black').describe('Border color'),
    fill: z.string().optional().describe('Fill color (optional)')
});

const drawPathParams = z.object({
    d: z.string().describe('SVG path data string (e.g., "M10 10 H 90 V 90 H 10 Z")'),
    color: z.string().optional().default('black').describe('Path color'),
    fill: z.string().optional().describe('Fill color (optional)'),
    width: z.number().optional().default(2).describe('Path stroke width')
});

const clearCanvasParams = z.object({}); // Empty object for no parameters

// Define a common return type (null)
const nullReturn = z.null();

// --- Zod Schemas for New Canvas Tools ---

const drawEllipseParams = z.object({
    x: z.number().describe('Center X coordinate'),
    y: z.number().describe('Center Y coordinate'),
    radiusX: z.number().describe('Horizontal radius'),
    radiusY: z.number().describe('Vertical radius'),
    color: z.string().optional().default('black').describe('Border color'),
    fill: z.string().optional().describe('Fill color (optional)')
});

const drawRegularPolygonParams = z.object({
    x: z.number().describe('Center X coordinate'),
    y: z.number().describe('Center Y coordinate'),
    sides: z.number().int().min(3).describe('Number of sides (minimum 3)'),
    radius: z.number().describe('Distance from center to vertex'),
    color: z.string().optional().default('black').describe('Border color'),
    fill: z.string().optional().describe('Fill color (optional)')
});

const drawStarParams = z.object({
    x: z.number().describe('Center X coordinate'),
    y: z.number().describe('Center Y coordinate'),
    numPoints: z.number().int().min(3).describe('Number of points (minimum 3)'),
    innerRadius: z.number().describe('Inner radius of the star'),
    outerRadius: z.number().describe('Outer radius of the star'),
    color: z.string().optional().default('black').describe('Border color'),
    fill: z.string().optional().describe('Fill color (optional)')
});

const drawTextParams = z.object({
    x: z.number().describe('Top-left X coordinate of the text box'),
    y: z.number().describe('Top-left Y coordinate of the text box'),
    text: z.string().describe('The text content to draw'),
    fontSize: z.number().optional().default(16).describe('Font size in pixels'),
    color: z.string().optional().default('black').describe('Stroke color (used for text outline/border)'),
    fill: z.string().optional().default('black').describe('Fill color of the text')
});

// --- Zod Schemas for Modify/Delete Tools ---

const deleteShapeParams = z.object({
    id: z.string().describe('The unique ID of the shape to delete')
});

// Define modifiable properties - common across shapes, all optional
const modifyShapeParams = z.object({
    id: z.string().describe('The unique ID of the shape to modify'),
    x: z.number().optional().describe('New X coordinate'),
    y: z.number().optional().describe('New Y coordinate'),
    color: z.string().optional().describe('New border/stroke color'),
    fill: z.string().optional().describe('New fill color'),
    // Properties specific to certain shapes (optional)
    width: z.number().optional().describe('New width (for rect)'),
    height: z.number().optional().describe('New height (for rect)'),
    radius: z.number().optional().describe('New radius (for circle, regularPolygon)'),
    radiusX: z.number().optional().describe('New horizontal radius (for ellipse)'),
    radiusY: z.number().optional().describe('New vertical radius (for ellipse)'),
    strokeWidth: z.number().optional().describe('New stroke width (for line, path)'),
    points: z.array(z.number()).optional().describe('New points array [x1, y1, x2, y2, ...] (for line)'),
    d: z.string().optional().describe('New SVG path data string (for path)'),
    sides: z.number().int().min(3).optional().describe('New number of sides (for regularPolygon)'),
    numPoints: z.number().int().min(3).optional().describe('New number of points (for star)'),
    innerRadius: z.number().optional().describe('New inner radius (for star)'),
    outerRadius: z.number().optional().describe('New outer radius (for star)'),
    text: z.string().optional().describe('New text content (for text)'),
    fontSize: z.number().optional().describe('New font size (for text)')
});

// --- Tool Registration Function ---

// Simple counter for generating unique IDs
let nextShapeId = 0;
const generateShapeId = () => `shape-${nextShapeId++}`;

export function registerCanvasTools(registry: ToolRegistry) {
    // Register drawLine with inline implementation
    registry.register({
        name: 'drawLine',
        description: 'Draws a line on the canvas.',
        parameters: drawLineParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => { // Type for args is inferred
            const { x1, y1, x2, y2, color, width } = args;
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'line', id, points: [x1, y1, x2, y2], color: color, strokeWidth: width };
            console.log('[canvas.ts->tools] Adding Line:', JSON.stringify(newShape));
            canvasShapes.push(newShape); // Uses imported state
            notifyCanvasChange(); // Uses imported function
            return null;
        }
    });

    // Register drawRect with inline implementation
    registry.register({
        name: 'drawRect',
        description: 'Draws a rectangle on the canvas.',
        parameters: drawRectParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => { // Type for args is inferred
            const { x, y, width, height, color, fill } = args;
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'rect', id, x, y, width, height, color, fill: fill || undefined };
            console.log('[canvas.ts->tools] Adding Rect:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    // Register drawCircle with inline implementation
    registry.register({
        name: 'drawCircle',
        description: 'Draws a circle on the canvas.',
        parameters: drawCircleParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => { // Type for args is inferred
            const { x, y, radius, color, fill } = args;
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'circle', id, x, y, radius, color, fill: fill || undefined };
            console.log('[canvas.ts->tools] Adding Circle:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    // Register drawPath with inline implementation
    registry.register({
        name: 'drawPath',
        description: 'Draws a path on the canvas using an SVG path data string (d attribute).',
        parameters: drawPathParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => { // Type for args is inferred
            const { d, color, fill, width } = args;
            if (!d || d.trim() === '') {
                console.warn("[canvas.ts->tools] drawPath called with empty or invalid 'd' string.");
                return null;
            }
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'path', id, d: d.trim(), color, fill: fill || undefined, strokeWidth: width };
            console.log('[canvas.ts->tools] Adding Path:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    // Register clearCanvas with inline implementation
    registry.register({
        name: 'clearCanvas',
        description: 'Clears the entire canvas.',
        parameters: clearCanvasParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async () => { // Remove unused args parameter
            console.log('[canvas.ts->tools] Clearing canvas shapes.');
            canvasShapes.length = 0;
            // Directly modify the imported canvasJSON requires it to be mutable and exported correctly
            // For simplicity, we rely on updateCanvasJSON which should handle internal state update
            // canvasJSON = {}; // Avoid direct modification if possible
            notifyCanvasChange();
            updateCanvasJSON({}); // Uses imported function
            return null;
        }
    });

    // --- Register New Tools ---

    registry.register({
        name: 'drawEllipse',
        description: 'Draws an ellipse on the canvas.',
        parameters: drawEllipseParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => {
            const { x, y, radiusX, radiusY, color, fill } = args;
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'ellipse', id, x, y, radiusX, radiusY, color, fill: fill || undefined };
            console.log('[canvas.ts->tools] Adding Ellipse:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    registry.register({
        name: 'drawRegularPolygon',
        description: 'Draws a regular polygon on the canvas.',
        parameters: drawRegularPolygonParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => {
            const { x, y, sides, radius, color, fill } = args;
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'regularPolygon', id, x, y, sides, radius, color, fill: fill || undefined };
            console.log('[canvas.ts->tools] Adding RegularPolygon:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    registry.register({
        name: 'drawStar',
        description: 'Draws a star shape on the canvas.',
        parameters: drawStarParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => {
            const { x, y, numPoints, innerRadius, outerRadius, color, fill } = args;
            const id = generateShapeId();
            const newShape: DrawableShape = { type: 'star', id, x, y, numPoints, innerRadius, outerRadius, color, fill: fill || undefined };
            console.log('[canvas.ts->tools] Adding Star:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    registry.register({
        name: 'drawText',
        description: 'Draws text on the canvas.',
        parameters: drawTextParams,
        returns: { description: 'Always returns null', schema: nullReturn },
        execute: async (args) => {
            const { x, y, text, fontSize, color, fill } = args;
            const id = generateShapeId();
            const effectiveFill = fill ?? color;
            const newShape: DrawableShape = { type: 'text', id, x, y, text, fontSize, color, fill: effectiveFill };
            console.log('[canvas.ts->tools] Adding Text:', JSON.stringify(newShape));
            canvasShapes.push(newShape);
            notifyCanvasChange();
            return null;
        }
    });

    // --- Register Modify/Delete Tools ---

    registry.register({
        name: 'deleteShape',
        description: 'Deletes a specific shape from the canvas using its ID.',
        parameters: deleteShapeParams,
        returns: { description: 'Returns null if successful, or an error message string if the shape ID is not found.', schema: z.union([nullReturn, z.string()]) },
        execute: async (args) => {
            const { id } = args;
            const index = canvasShapes.findIndex(shape => shape.id === id);
            if (index === -1) {
                const errorMsg = `[canvas.ts->tools] Shape with ID "${id}" not found for deletion.`;
                console.warn(errorMsg);
                return errorMsg; // Return error message
            }
            const deletedShape = canvasShapes.splice(index, 1)[0];
            console.log('[canvas.ts->tools] Deleting Shape:', JSON.stringify(deletedShape));
            notifyCanvasChange();
            return null;
        }
    });

    registry.register({
        name: 'modifyShape',
        description: 'Modifies properties of a specific shape on the canvas using its ID. Only provided properties are updated.',
        parameters: modifyShapeParams,
        returns: { description: 'Returns null if successful, or an error message string if the shape ID is not found.', schema: z.union([nullReturn, z.string()]) },
        execute: async (args) => {
            const { id, ...updates } = args;
            const shapeIndex = canvasShapes.findIndex(shape => shape.id === id);

            if (shapeIndex === -1) {
                const errorMsg = `[canvas.ts->tools] Shape with ID "${id}" not found for modification.`;
                console.warn(errorMsg);
                return errorMsg; // Return error message
            }

            const originalShape = canvasShapes[shapeIndex];
            
            // Create the updated shape by merging old and new properties
            // Filter out undefined values from updates before merging
            const validUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
                if (value !== undefined) {
                    // @ts-expect-error - We accept that not all properties are valid for all shapes, let Konva handle it or add more validation if needed
                    acc[key] = value;
                }
                return acc;
            }, {} as Partial<DrawableShape>);

            // Use type assertion to resolve the type conflict. Assumes Konva handles extra/invalid props gracefully.
            const updatedShape = { ...originalShape, ...validUpdates } as DrawableShape;

            // Replace the old shape with the updated one
            canvasShapes[shapeIndex] = updatedShape;
            
            console.log(`[canvas.ts->tools] Modifying Shape ID "${id}". Updates:`, JSON.stringify(validUpdates));
            console.log('[canvas.ts->tools] Shape after modification:', JSON.stringify(updatedShape));
            
            notifyCanvasChange();
            return null;
        }
    });
} 
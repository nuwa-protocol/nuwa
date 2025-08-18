import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from './components/Editor';
import Examples from './components/Examples';
import Output from './components/Output';
import ToolPanel from './components/ToolPanel';
import AIChat from './components/AIChat';
import { BoltIcon } from './components/AppIcons';
import Layout from './components/Layout';
import { examples, examplesById } from './examples';
import { renderExampleComponent } from './components/ExampleComponents';
import { 
  Interpreter, 
  ToolRegistry,
  OutputHandler,
  NormalizedToolSchema
} from './services/interpreter';
import { parse } from 'nuwa-script';
import { AIService } from './services/ai';
import { storageService } from './services/storage';
import { registerTradingTools } from './examples/trading'; 
import { registerCanvasTools } from './examples/canvas-tools'; 
import { canvasShapes, subscribeToCanvasChanges, updateCanvasJSON } from './examples/canvas'; 
import { ExampleConfig } from './types/Example';
import type { DrawableShape } from './components/DrawingCanvas';
import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

// Define some types to supplement original component interfaces
interface CustomMessage {
  role: 'user' | 'assistant'; // Align with Message type in ai.ts
  content: string;
}

// Class to handle buffering PRINT output
class BufferingOutputHandler {
    private buffer: string[] = [];

    constructor() {
    }

    // Called by the interpreter for PRINT statements
    handleOutput(message: string): void {
        this.buffer.push(message);
    }

    // Clear the buffer (called before a run)
    clear(): void {
        this.buffer = [];
    }

    // Get the buffered messages as a single string and clear buffer
    flush(): string | null {
        if (this.buffer.length === 0) {
            return null;
        }
        const combined = this.buffer.join('\n');
        this.clear(); // Clear after flushing
        return combined;
    }

    // Get the bound handler function to pass to the interpreter
    getHandler(): OutputHandler {
        return this.handleOutput.bind(this);
    }
}

// Define a simplified interface for what App needs from the interpreter setup
interface NuwaSetup {
  interpreter: Interpreter;
  toolRegistry: ToolRegistry;
  bufferingOutputHandler: BufferingOutputHandler;
}

type ActiveSidePanel = 'examples' | 'tools'; // Define type if needed here

function App() {
  // State management - Keep application logic state
  const [selectedExample, setSelectedExample] = useState<ExampleConfig | null>(null);
  const [output, setOutput] = useState('');
  const [executionError, setExecutionError] = useState<string | undefined>(undefined);
  const [nuwaSetup, setNuwaSetup] = useState<NuwaSetup | null>(null);
  const [apiKey, setApiKey] = useState(storageService.getApiKey());
  const [baseUrl, setBaseUrl] = useState(storageService.getBaseUrl() || 'https://api.openai.com');
  const [modelName, setModelName] = useState(storageService.getModel() || 'gpt-4o');
  const [temperature, setTemperature] = useState<number>(storageService.getTemperature() ?? 0.3);
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // State moved to Layout: activeSidePanel, scriptPanelHeight, isDragging
  const [activeSidePanel, setActiveSidePanel] = useState<ActiveSidePanel>('examples'); // Keep state here, pass down initial value and handler
  const [messages, setMessages] = useState<CustomMessage[]>([]);
  const [currentToolSchemas, setCurrentToolSchemas] = useState<NormalizedToolSchema[]>([]);
  const [shapes, setShapes] = useState<DrawableShape[]>(canvasShapes);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null); // Keep ref if Editor needs it
  const [editorContent, setEditorContent] = useState(''); // Editor content state



  // Memoize the onCanvasChange callback to prevent unnecessary re-renders
  const handleCanvasChange = useCallback((json: object) => {
    console.log('[App.tsx] Canvas JSON updated (via callback):', json);
    updateCanvasJSON(json); // Update global JSON state and tool registry state
  }, []);

  // Select example and setup the interpreter
  const handleSelectExample = useCallback((example: ExampleConfig) => {
    setSelectedExample(example);
    setEditorContent(example.script);
    setOutput('');
    setExecutionError(undefined);
    setMessages([]); // Clear chat history when changing examples
    storageService.saveLastSelectedExample(example.id);
    
    // Call the example's resetState method if it exists
    console.log(`[App.tsx] Calling resetState for ${example.id}...`);
    example.stateManager?.resetState?.();

    // Setup interpreter AFTER potentially clearing state
    setupInterpreter(example);
  }, []);

  // Initialization
  useEffect(() => {
    const lastExampleId = storageService.getLastSelectedExample() || examples[0]?.id;
    if (lastExampleId && examplesById[lastExampleId]) {
      handleSelectExample(examplesById[lastExampleId]);
    } else if (examples.length > 0) {
      handleSelectExample(examples[0]);
    }

    // Subscribe to canvas shape changes 
    const unsubscribe = subscribeToCanvasChanges(() => {
      console.log('[App.tsx] Syncing shapes via subscription. Global state:', JSON.stringify(canvasShapes)); 
      // Force state update to trigger re-rendering
      setShapes(() => {
        // Ensure it's a new reference to trigger rendering
        return [...canvasShapes];
      });
    });

    // Cleanup subscription 
    return () => unsubscribe();
  }, [handleSelectExample]); // Runs once on mount


  // Setup interpreter and tools (MODIFIED)
  const setupInterpreter = (example: ExampleConfig) => {
    console.log(`[App.tsx] Setting up interpreter for example: ${example.id}`);
    const toolRegistry = new ToolRegistry();
    
    // Store registry globally (remains the same)
    const globalObj = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : {});
    (globalObj as { __toolRegistry?: ToolRegistry }).__toolRegistry = toolRegistry;
    
    const bufferingHandler = new BufferingOutputHandler(); 
    const interpreter = new Interpreter(toolRegistry, bufferingHandler.getHandler());
    
    // --- Register tools based on example ID using the new functions --- 
    try {
      if (example.id === 'trading') {
        console.log("[App.tsx] Registering trading tools...");
        registerTradingTools(toolRegistry);
      } else if (example.id === 'canvas') {
        console.log("[App.tsx] Registering canvas tools...");
        registerCanvasTools(toolRegistry);
      }
      // Add other examples here if needed
      console.log("[App.tsx] Tools registered successfully.");
    } catch (error) {
      console.error("[App.tsx] Error registering tools:", error);
      setExecutionError(`Failed to register tools for ${example.name}: ${error instanceof Error ? error.message : String(error)}`);
      // Set setup to null or handle partially initialized state?
      setNuwaSetup(null);
      setCurrentToolSchemas([]);
      return; // Stop setup if tools fail to register
    }
    // ---------------------------------------------------------------------
    
    // If example has a state manager, initialize state (remains the same)
    if (example.stateManager) {
      console.log(`[App.tsx] Initializing state for ${example.id} using state manager`);
      example.stateManager.updateStateInRegistry();
    }
    
    // Set the interpreter and registry in state (remains the same)
    setNuwaSetup({ 
      interpreter, 
      toolRegistry,
      bufferingOutputHandler: bufferingHandler 
    }); 
    
    // Get and set the normalized schemas for the ToolPanel (remains the same)
    try {
        const schemas = toolRegistry.getAllSchemas();
        console.log("[App.tsx] Retrieved normalized schemas for ToolPanel:", schemas);
        setCurrentToolSchemas(schemas);
    } catch (error) { 
        console.error("[App.tsx] Error getting tool schemas:", error);
        setCurrentToolSchemas([]); // Set empty if error occurs
    }
  };

  // Run script - improved execution process - Wrap in useCallback
  const handleRun = useCallback(async (scriptToRun: string): Promise<{ 
    success: boolean; 
    errorMessage?: string; 
    capturedOutput?: string | null 
  }> => {
    if (!nuwaSetup) return { success: false, errorMessage: "Interpreter not initialized." };

    setIsRunning(true);
    setOutput(''); // Clear Output panel before run
    setExecutionError(undefined); // Clear previous errors

    const bufferingHandler = nuwaSetup.bufferingOutputHandler;
    bufferingHandler.clear();

    try {
      console.log("[App.tsx] Parsing and executing script...");
      const scriptAST = parse(scriptToRun);

      if (!scriptAST || typeof scriptAST !== 'object' || scriptAST.kind !== 'Script') {
        throw new Error("Parsing did not return a valid Script AST node.");
      }

      // Ensure script state is synchronized
      setEditorContent(scriptToRun);
      
      // Execute script
      const scope = await nuwaSetup.interpreter.execute(scriptAST);
      console.log("Execution finished. Final scope:", scope);
      
      // If it's a Canvas example, ensure refresh
      if (selectedExample?.id === 'canvas') {
        // Update canvas state once to ensure refresh
        console.log("[App.tsx] Canvas example executed, force refreshing canvas...");
        setShapes([...canvasShapes]);
      }

      const capturedOutput = bufferingHandler.flush();
      // Add output to messages state - MOVED TO handleAIChatMessage based on return value
      // if (capturedOutput !== null) { 
      //   setMessages(prev => [...prev, {
      //     role: 'assistant',
      //     content: capturedOutput
      //   }]);
      // }

      return { success: true, capturedOutput: capturedOutput };

    } catch (err) {
      console.error("Execution or Parsing error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setExecutionError(errorMsg);
      return { success: false, errorMessage: errorMsg };
    } finally {
      setIsRunning(false);
    }
  }, [nuwaSetup, selectedExample, setIsRunning, setOutput, setExecutionError, setEditorContent, setShapes]); // Removed setMessages dependency

  // Handle script changes
  const handleScriptChange = useCallback((newCode = '') => {
    setEditorContent(newCode);
  }, []);

  // Handle run button click
  const handleRunClick = useCallback(() => {
    // Execute using the latest editor content
    handleRun(editorContent);
  }, [editorContent, handleRun]);

  // AI chat message handling - Wrap in useCallback
  const handleAIChatMessage = useCallback(async (message: string) => {
    // Check if API key is set
    if (!apiKey) {
      // If message looks like an API key
      if (message.startsWith('sk-') && message.length > 20) {
        setApiKey(message);
        storageService.saveApiKey(message);
        setMessages(prev => [...prev, { role: 'assistant', content: 'API Key saved.' }]);
        return;
      }
      // Ask for API key if not set
      setMessages(prev => [...prev, { role: 'assistant', content: 'Please provide your OpenAI API key to use the AI features.' }]);
      return;
    }

    if (!nuwaSetup) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Interpreter not initialized. Please select an example first.' }]);
      return;
    }

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setIsGenerating(true);
    setOutput(''); // Clear output
    setExecutionError(undefined); // Clear errors

    try {
      // Create AIService instance with apiKey, baseUrl, modelName, appSpecificGuidance, and temperature
      const aiService = new AIService({
        apiKey: apiKey,
        baseUrl: baseUrl,
        model: modelName,
        appSpecificGuidance: selectedExample?.aiPrompt,
        temperature: temperature,
      });
      const toolRegistry = nuwaSetup.toolRegistry;
      const generatedScript = await aiService.generateNuwaScript(
        message,
        toolRegistry,
        messages
      );

      setEditorContent(generatedScript);

      // Run the generated script and get the result
      const runResult = await handleRun(generatedScript);

      // Add output or error to chat history based on run result
      if (runResult.success) {
        // Process successful run output
        const outputContent = runResult.capturedOutput;
        if (typeof outputContent === 'string' && outputContent.trim() !== '') {
          setMessages(prev => [...prev, { role: 'assistant', content: outputContent }]);
        }
        // Optionally add a generic success message if no output?
        // else { setMessages(prev => [...prev, { role: 'assistant', content: "Script executed successfully." }]) }
      } else {
        // Add error message to history for AI feedback
        const errorMessageContent = `Execution failed with error:\\n\`\`\`\\n${runResult.errorMessage}\\n\`\`\``;
        setMessages(prev => [...prev, { role: 'assistant', content: errorMessageContent }]);
      }

    } catch (error) {
      console.error("AI Generation error:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Display detailed error message to the user
      setMessages(prev => [...prev, { role: 'assistant', content: `Error generating script:\n\`\`\`\n${errorMsg}\n\`\`\`` }]);
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, nuwaSetup, baseUrl, modelName, selectedExample?.aiPrompt, temperature, handleRun, messages]);

  // Handle API Key change from input - Wrap in useCallback
  const handleApiKeyChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newKey = event.target.value;
    setApiKey(newKey);
    storageService.saveApiKey(newKey); // Save on change
    // Dependency: setApiKey (storageService is constant)
  }, [setApiKey]);

  // Rename handler for Base URL change - Wrap in useCallback
  const handleBaseUrlChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newBaseUrl = event.target.value;
    setBaseUrl(newBaseUrl);
    storageService.saveBaseUrl(newBaseUrl); // Save on change
    // Dependency: setBaseUrl
  }, [setBaseUrl]);

  // Add handler for Model Name change - Wrap in useCallback
  const handleModelChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newModel = event.target.value;
    setModelName(newModel);
    storageService.saveModel(newModel); // Save on change
    // Dependency: setModelName
  }, [setModelName]);

  // Add handler for Temperature change - Wrap in useCallback
  const handleTemperatureChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newTempStr = event.target.value;
    const newTempNum = parseFloat(newTempStr);
    if (!isNaN(newTempNum) && newTempNum >= 0 && newTempNum <= 2) { // Basic validation
      setTemperature(newTempNum);
      storageService.saveTemperature(newTempNum); // Save on change
    }
  }, [setTemperature]);

  // Clear output
  const handleClearOutput = useCallback(() => {
    setOutput('');
    setExecutionError(undefined);
  }, []);

  // Prepare layout component properties
  const headerProps = {
    onRunClick: handleRunClick,
    isRunning,
    isRunDisabled: isRunning || !editorContent.trim() || !nuwaSetup
  };

  const sidebarContent = activeSidePanel === 'examples' ? (
    <Examples 
      examples={examples.map(ex => ({
        name: ex.name,
        description: ex.description,
        code: ex.script
      }))} 
      onSelect={(code) => {
        const example = examples.find(e => e.script === code);
        if (example) {
          handleSelectExample(example);
        }
      }} 
    />
  ) : (
    <ToolPanel 
      tools={currentToolSchemas}
    />
  );

  // Memoize the mainPanelContent to prevent unnecessary re-renders
  const mainPanelContent = useMemo(() => (
    <>
      {/* Display Execution Error */}
      {executionError && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md flex items-start">
          <span className="w-5 h-5 mr-2 flex-shrink-0 text-red-600 font-bold">(!)</span>
          <pre className="text-sm whitespace-pre-wrap break-words flex-1">{executionError}</pre>
        </div>
      )}

      {selectedExample?.componentId ? (
        // Render custom component based on componentId
        <div className="component-container w-full">
          {renderExampleComponent(
            selectedExample.componentId,
            // Pass component-specific props if needed
            selectedExample.id === 'canvas' ? {
              width: 500,
              height: 400,
              shapes: shapes,
              onCanvasChange: handleCanvasChange
            } : undefined
          )}
        </div>
      ) : (
        // Render standard output for examples without custom component
        <>
          {!output && !executionError && !isRunning && (
            <div className="text-center text-gray-500 flex-1 flex flex-col justify-center items-center">
              <div className="welcome-icon">
                <BoltIcon size="large" className="mx-auto mb-3 opacity-50" />
              </div>
              <p>Run your code to see output here</p>
              <p className="text-xs mt-2 max-w-sm">Press the "Run" button above to execute your NuwaScript code</p>
            </div>
          )}
          <Output 
            output={output} 
            error={null} 
            onClear={handleClearOutput} 
            loading={isRunning}
          />
        </>
      )}
    </>
  ), [executionError, selectedExample?.componentId, selectedExample?.id, shapes, handleCanvasChange, output, isRunning, handleClearOutput]);

  // Memoize the scriptPanelContent to prevent unnecessary re-renders
  const scriptPanelContent = useMemo(() => (
    <Editor
      key={selectedExample?.id || 'default'} 
      defaultValue={editorContent}
      readOnly={isRunning}
      onChange={handleScriptChange}
      language="nuwa"
      editorInstanceRef={editorRef}
    />
  ), [selectedExample?.id, isRunning, handleScriptChange, editorContent]);

  const chatPanelContent = useMemo(() => (
    <div className="aichat-container h-full flex flex-col">
      <div className="api-key-input-container p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="mb-2">
          <label htmlFor="apiKeyInput" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">API Key:</label>
          <input 
            id="apiKeyInput" 
            type="password" 
            value={apiKey || ''}
            onChange={handleApiKeyChange}
            placeholder="Enter API Key (e.g., sk-...)"
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div className="mb-2">
          <label htmlFor="baseUrlInput" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Base URL:</label>
          <input 
            id="baseUrlInput" 
            type="text" 
            value={baseUrl}
            onChange={handleBaseUrlChange}
            placeholder="e.g., https://api.openai.com"
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor="modelNameInput" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Model:</label>
          <input 
            id="modelNameInput" 
            type="text" 
            value={modelName}
            onChange={handleModelChange}
            placeholder="e.g., gpt-4o"
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor="temperatureInput" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Temperature:</label>
          <input 
            id="temperatureInput" 
            type="number" 
            value={temperature}
            onChange={handleTemperatureChange}
            min="0"
            max="2"
            step="0.1"
            placeholder="e.g., 0.7"
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>
      <AIChat 
        messages={messages} 
        onSendMessage={handleAIChatMessage} 
        isProcessing={isGenerating}
        apiKeySet={!!apiKey}
      />
    </div>
  ), [handleAIChatMessage, messages, isGenerating, apiKey, baseUrl, modelName, temperature, handleApiKeyChange, handleBaseUrlChange, handleModelChange, handleTemperatureChange]);

  // Build dynamic title for main panel based on selected example
  const getMainPanelTitle = () => {
    if (!selectedExample) return 'Application Output';
    
    if (selectedExample.id === 'canvas') return 'Canvas';
    if (selectedExample.id === 'trading') return 'Trading Dashboard';
    
    return 'Application Output';
  };

  // Render using the Layout component
  return (
    <Layout
      headerProps={headerProps}
      sidebarContent={sidebarContent}
      mainPanelTitle={getMainPanelTitle()}
      mainPanelContent={mainPanelContent}
      scriptPanelTitle="NuwaScript Editor"
      scriptPanelContent={scriptPanelContent}
      chatPanelContent={chatPanelContent}
      onSelectSidebarTab={setActiveSidePanel}
      initialActiveSidePanel={activeSidePanel}
    />
  );
}

export default App;

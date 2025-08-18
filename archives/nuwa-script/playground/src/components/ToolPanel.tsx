import React, { useState } from 'react';
import type { NormalizedToolSchema } from '../services/interpreter';
import type { JSONSchema7Definition, JSONSchema7Type } from 'json-schema';

interface ToolPanelProps {
  tools: NormalizedToolSchema[];
}

const renderSchema = (schema: JSONSchema7Definition | undefined): string => {
  if (typeof schema === 'boolean') {
    return schema ? 'any' : 'never';
  }
  if (!schema) return 'unknown';
  if (schema.type) {
    if (Array.isArray(schema.type)) {
        return schema.type.join(' | ');
    }
    return schema.type;
  }
  if (schema.$ref) return schema.$ref;
  if (schema.enum) return schema.enum.map((e: JSONSchema7Type) => JSON.stringify(e)).join(' | ');
  if (schema.properties) return 'object';
  if (schema.items) return `array (${renderSchema(schema.items as JSONSchema7Definition)})`;
  if (schema.anyOf) return schema.anyOf.map((s: JSONSchema7Definition) => renderSchema(s as JSONSchema7Definition)).join(' | ');
  if (schema.allOf) return schema.allOf.map((s: JSONSchema7Definition) => renderSchema(s as JSONSchema7Definition)).join(' & ');
  if (schema.oneOf) return schema.oneOf.map((s: JSONSchema7Definition) => renderSchema(s as JSONSchema7Definition)).join(' | ');

  if (schema.const !== undefined) {
    return JSON.stringify(schema.const);
  }
  
  return 'unknown';
};

const ToolPanel: React.FC<ToolPanelProps> = ({ tools }) => {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleTool = (name: string) => {
    setExpandedTool(expandedTool === name ? null : name);
  };

  const filteredTools = tools.filter(tool => 
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="tool-panel-container h-full flex flex-col dark:bg-gray-800 text-gray-300">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 rounded-md bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400 dark:text-gray-500 search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      {filteredTools.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 p-4 text-center">
          <div>
            <svg className="h-12 w-12 mx-auto mb-3 opacity-50 text-gray-400 dark:text-gray-600 not-found-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z"></path>
            </svg>
            <p>No tools found matching "{searchQuery}"</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTools.map((tool) => (
              <div key={tool.name} className="overflow-hidden">
                <button
                  className={`sidebar-item w-full text-left p-3 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    expandedTool === tool.name ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                  onClick={() => toggleTool(tool.name)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-md bg-purple-900/30 flex items-center justify-center text-purple-400 mr-3 flex-shrink-0">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"></path>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">
                          {tool.name}
                        </h3>
                        <p className="sidebar-item-description text-xs text-gray-500 dark:text-gray-400 truncate">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  </div>
                  <svg 
                    className={`ml-2 h-5 w-5 text-gray-400 dark:text-gray-500 transition-transform ${expandedTool === tool.name ? 'transform rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>
                
                {expandedTool === tool.name && (
                  <div className="tool-detail-content p-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 text-sm">
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                        Description
                      </h4>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-normal break-words">
                        {tool.description}
                      </p>
                    </div>
                    
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                        Parameters
                      </h4>
                      {tool.parameters.properties && Object.keys(tool.parameters.properties).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(tool.parameters.properties).map(([paramName, paramSchema]: [string, JSONSchema7Definition]) => {
                            const isRequired = tool.parameters.required?.includes(paramName) ?? false;
                            const description = typeof paramSchema === 'object' ? paramSchema.description : undefined;
                            const paramType = renderSchema(paramSchema);

                            return (
                              <div key={paramName} className="p-2 rounded-md bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 overflow-hidden">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-xs text-purple-600 dark:text-purple-400">{paramName}</span>
                                  <span className="text-xs bg-gray-200 dark:bg-gray-800 rounded px-2 py-0.5 text-gray-600 dark:text-gray-400">
                                    {paramType}
                                  </span>
                                </div>
                                {description && (
                                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-500 whitespace-normal break-all">
                                    {description}
                                  </p>
                                )}
                                {isRequired && (
                                  <div className="mt-1 text-xs text-amber-500 dark:text-amber-400 flex items-center">
                                    <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                    </svg>
                                    Required
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-500 italic">No parameters</p>
                      )}
                    </div>
                    
                    {tool.returns && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                          Returns
                        </h4>
                        {tool.returns.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 italic">
                              {tool.returns.description}
                          </p>
                        )}
                        <div className="inline-block bg-gray-200 dark:bg-gray-800 rounded px-2 py-1 text-xs font-mono text-gray-700 dark:text-gray-300">
                          {renderSchema(tool.returns.schema)}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                        Example Usage
                      </h4>
                      <pre className="p-2 bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-md text-xs overflow-x-auto">
                        {`CALL ${tool.name} {${
                          tool.parameters.properties && Object.keys(tool.parameters.properties).length > 0
                            ? Object.keys(tool.parameters.properties).map(paramName => `${paramName}=value`).join(', ')
                            : ''
                        }}`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolPanel;
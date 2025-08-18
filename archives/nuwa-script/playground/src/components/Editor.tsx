import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history } from '@codemirror/commands';
import { indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { tags } from '@lezer/highlight';

interface EditorProps {
  defaultValue: string;
  onChange: (value: string) => void;
  language?: 'javascript' | 'json' | 'nuwa';
  readOnly?: boolean;
  editorInstanceRef?: React.MutableRefObject<{ setValue: (value: string) => void } | null>;
}

// Custom highlight styles for light mode
const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#8B31FF', fontWeight: 'bold' },  // Brighter purple, bold
  { tag: tags.definition(tags.variableName), color: '#0088FF', fontWeight: 'bold' },  // Brighter blue, bold
  { tag: tags.variableName, color: '#00AAEE' },  // Brighter cyan
  { tag: tags.comment, color: '#6A737D', fontStyle: 'italic' },  // Deeper gray, italic
  { tag: tags.string, color: '#2AA052' },  // Deeper green
  { tag: tags.number, color: '#E36209' },  // Brighter orange
  { tag: tags.bool, color: '#D73A49', fontWeight: 'bold' },  // Brighter red, bold
  { tag: tags.function(tags.variableName), color: '#00C48F', fontWeight: 'bold' },  // Brighter turquoise, bold
  { tag: tags.operator, color: '#D73A49' },  // Brighter red
  { tag: tags.propertyName, color: '#79B8FF' },  // Light blue
  { tag: tags.labelName, color: '#0088FF' },  // Same color as definition
  { tag: tags.typeName, color: '#6937FF' },  // Medium purple
]);

// Custom highlight styles for dark mode
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#C792EA', fontWeight: 'bold' },  // Bright purple, bold
  { tag: tags.definition(tags.variableName), color: '#82AAFF', fontWeight: 'bold' },  // Bright blue, bold
  { tag: tags.variableName, color: '#89DDFF' },  // Bright cyan
  { tag: tags.comment, color: '#676E95', fontStyle: 'italic' },  // Medium gray, italic
  { tag: tags.string, color: '#C3E88D' },  // Bright green
  { tag: tags.number, color: '#F78C6C' },  // Bright orange
  { tag: tags.bool, color: '#FF5572', fontWeight: 'bold' },  // Bright red, bold
  { tag: tags.function(tags.variableName), color: '#80CBC4', fontWeight: 'bold' },  // Bright turquoise, bold
  { tag: tags.operator, color: '#FF5572' },  // Bright red
  { tag: tags.propertyName, color: '#BABED8' },  // Bright blue-purple
  { tag: tags.labelName, color: '#82AAFF' },  // Same color as definition
  { tag: tags.typeName, color: '#B2CCD6' },  // Bright blue-cyan
]);

// Light theme
const lightTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    backgroundColor: '#F8FAFC',
    color: '#1A365D',
    padding: '8px 0',
  },
  '.cm-gutters': {
    backgroundColor: '#EDF2F7',
    color: '#4A5568',
    border: 'none',
    borderRight: '1px solid #CBD5E0',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(191, 219, 254, 0.3)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(191, 219, 254, 0.3)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(147, 197, 253, 0.3)',
  },
  '.cm-line': {
    padding: '0 8px',
    color: '#1A365D',
  },
  '.cm-cursor': {
    borderLeftColor: '#3182CE',
    borderLeftWidth: '2px',
  },
  '.cm-searchMatch': { 
    backgroundColor: 'rgba(250, 240, 137, 0.5)', 
    outline: '1px solid #F6E05E' 
  },
  '.cm-searchMatch.cm-searchMatch-selected': { 
    backgroundColor: 'rgba(250, 240, 137, 0.8)'
  },
  '.cm-selectionBackground': { 
    backgroundColor: 'rgba(147, 197, 253, 0.3)'
  },
});

// Dark theme
const darkTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    backgroundColor: '#1A202C',
    color: '#E2E8F0',
    padding: '8px 0',
  },
  '.cm-gutters': {
    backgroundColor: '#171923',
    color: '#A0AEC0',
    border: 'none',
    borderRight: '1px solid #2D3748',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(45, 55, 72, 0.5)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(45, 55, 72, 0.5)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(113, 128, 150, 0.4)',
  },
  '.cm-line': {
    padding: '0 8px',
    color: '#E2E8F0',
  },
  '.cm-cursor': {
    borderLeftColor: '#90CDF4',
    borderLeftWidth: '2px',
  },
  '.cm-searchMatch': { 
    backgroundColor: 'rgba(214, 158, 46, 0.3)', 
    outline: '1px solid #D69E2E'
  },
  '.cm-searchMatch.cm-searchMatch-selected': { 
    backgroundColor: 'rgba(214, 158, 46, 0.5)'
  },
  '.cm-selectionBackground': { 
    backgroundColor: 'rgba(113, 128, 150, 0.4)'
  },
});

const Editor: React.FC<EditorProps> = ({
  defaultValue,
  onChange,
  language = 'javascript',
  readOnly = false,
  editorInstanceRef = undefined,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const lastKnownValueRef = useRef<string>(defaultValue);
  const isChangingRef = useRef<boolean>(false);
  
  // Use document.documentElement.classList to determine dark mode
  const isDarkMode = () => document.documentElement.classList.contains('dark');
  
  // Initialize editor and provide editorInstanceRef API
  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      createEditor();
    }

    return () => {
      if (editorInstanceRef) {
        editorInstanceRef.current = null;
      }
      viewRef.current?.destroy();
      viewRef.current = undefined;
    };
  }, []);  // 这里移除了依赖项，防止重新初始化编辑器
  
  // 专门处理外部传入的defaultValue变更
  useEffect(() => {
    // 只在编辑器已创建，并且defaultValue确实发生变化时更新
    if (viewRef.current && defaultValue !== lastKnownValueRef.current && !isChangingRef.current) {
      // 设置标志避免循环更新
      isChangingRef.current = true;
      lastKnownValueRef.current = defaultValue;
      
      // 保存当前选择状态和滚动位置
      const view = viewRef.current;
      const currentSelection = view.state.selection;
      const scrollInfo = {
        top: view.scrollDOM.scrollTop,
        left: view.scrollDOM.scrollLeft
      };
      
      // 应用事务更新
      const transaction = view.state.update({
        changes: { from: 0, to: view.state.doc.length, insert: defaultValue },
        selection: currentSelection // 保留选择状态
      });
      
      view.focus(); // 确保编辑器保持焦点
      view.dispatch(transaction);
      
      // 在UI更新后恢复滚动位置
      setTimeout(() => {
        if (viewRef.current) {
          viewRef.current.scrollDOM.scrollTop = scrollInfo.top;
          viewRef.current.scrollDOM.scrollLeft = scrollInfo.left;
        }
        isChangingRef.current = false;
      }, 0);
    }
  }, [defaultValue]);
  

  const createEditor = () => {
    const dark = isDarkMode();
    const currentValue = viewRef.current?.state.doc.toString() || defaultValue;
    
    if (viewRef.current) {
 
      // const hasFocus = document.activeElement === viewRef.current.contentDOM;
      // const scrollInfo = {
      //   top: viewRef.current.scrollDOM.scrollTop,
      //   left: viewRef.current.scrollDOM.scrollLeft
      // };
      
      viewRef.current.destroy();
      viewRef.current = undefined;
      
   
      if (!editorRef.current) return;
    }
    
    const startState = EditorState.create({
      doc: currentValue,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        bracketMatching(),
        foldGutter(),
        keymap.of([...defaultKeymap, ...foldKeymap, indentWithTab]),
        language === 'javascript' || language === 'nuwa'
          ? javascript({ jsx: true, typescript: true })
          : javascript({ jsx: false, typescript: false }),
        syntaxHighlighting(dark ? darkHighlightStyle : lightHighlightStyle),
        dark ? darkTheme : lightTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isChangingRef.current) {
            const newValue = update.state.doc.toString();
            lastKnownValueRef.current = newValue;
            onChange(newValue);
          }
        }),
        EditorState.readOnly.of(readOnly),
      ],
    });

    if (editorRef.current) {
      const view = new EditorView({
        state: startState,
        parent: editorRef.current,
      });

      viewRef.current = view;

      if (editorInstanceRef) {
        editorInstanceRef.current = {
          setValue: (value: string) => {
            if (value === view.state.doc.toString()) return;
            
            isChangingRef.current = true;
            
            const hasFocus = document.activeElement === view.contentDOM;
            const scrollInfo = {
              top: view.scrollDOM.scrollTop,
              left: view.scrollDOM.scrollLeft
            };
          
            const transaction = view.state.update({
              changes: { from: 0, to: view.state.doc.length, insert: value }
            });
            view.dispatch(transaction);
            lastKnownValueRef.current = value;
            
            if (hasFocus) view.focus();
            
            setTimeout(() => {
              view.scrollDOM.scrollTop = scrollInfo.top;
              view.scrollDOM.scrollLeft = scrollInfo.left;
              isChangingRef.current = false;
            }, 0);
          }
        };
      }
    }
  };
  
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          mutation.target === document.documentElement
        ) {
          const hasFocus = viewRef.current && document.activeElement === viewRef.current.contentDOM;
          createEditor();
          if (hasFocus && viewRef.current) {
            setTimeout(() => viewRef.current?.focus(), 10);
          }
          break;
        }
      }
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-full overflow-hidden bg-white dark:bg-gray-900">
      <div ref={editorRef} className="h-full overflow-auto" />
    </div>
  );
};

export default Editor;
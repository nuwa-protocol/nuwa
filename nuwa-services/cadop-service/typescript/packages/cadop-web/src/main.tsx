import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import './styles/globals.css';

// 在开发环境中启用WebAuthn调试器
if (import.meta.env.DEV) {
  import('./lib/debug/webauthn-debugger').then(({ webauthnDebugger }) => {
    console.log('🐛 WebAuthn Debugger loaded. Use `webauthnDebugger` in console for debugging.');
    console.log('Available methods:');
    console.log('- webauthnDebugger.testAuthentication(email) - 完整的认证测试');
    console.log('- webauthnDebugger.resetCounter(credentialId) - 重置counter');
    console.log('- webauthnDebugger.getEnvironmentInfo() - 获取环境信息');
    console.log('- webauthnDebugger.getSessionSummary() - 获取调试会话摘要');
  }).catch(console.error);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
); 
import React, { useEffect } from 'react';

export const TestPage: React.FC = () => {
  useEffect(() => {
    console.log('TestPage component mounted');
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🧪 最简单的测试页面</h1>
      <p>如果你能看到这个页面，说明基本的 React 渲染是正常的。</p>
      
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '5px' }}>
        <h3>基本功能测试</h3>
        <ul>
          <li>✅ React 组件渲染</li>
          <li>✅ TypeScript 编译</li>
          <li>✅ 路由系统</li>
        </ul>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h3>测试按钮</h3>
        <button 
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
          onClick={() => {
            console.log('Test button clicked');
            alert('按钮点击正常！');
          }}
        >
          点击测试
        </button>
        
        <button 
          style={{ 
            padding: '10px 20px', 
            backgroundColor: '#28a745', 
            color: 'white', 
            border: 'none', 
            borderRadius: '5px',
            cursor: 'pointer'
          }}
          onClick={() => {
            console.log('Navigation button clicked');
            window.location.href = '/';
          }}
        >
          返回首页
        </button>
      </div>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>页面加载时间: {new Date().toLocaleTimeString()}</p>
        <p>如果这个页面正常显示，我们可以逐步添加更复杂的组件。</p>
        <p>调试信息已输出到控制台。</p>
      </div>
    </div>
  );
}; 
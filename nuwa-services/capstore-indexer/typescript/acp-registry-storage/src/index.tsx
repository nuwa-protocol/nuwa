import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/App.css';
import './styles/components.css';
import App from './App';

// 移除加载动画
const removeLoadingAnimation = () => {
  const loadingElement = document.querySelector('.app-loading');
  if (loadingElement) {
    loadingElement.remove();
  }
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// 应用加载完成时移除加载动画
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 监听应用加载完成
const handleAppLoad = () => {
  removeLoadingAnimation();
};

// 如果应用已经加载完成
if (document.readyState === 'complete') {
  setTimeout(handleAppLoad, 1000);
} else {
  window.addEventListener('load', handleAppLoad);
}
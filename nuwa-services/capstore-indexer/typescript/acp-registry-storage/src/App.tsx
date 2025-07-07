import React, { useState, useEffect } from 'react';
import HeliaProvider from './context/HeliaProvider';
import Header from './components/Header';
import ConnectionPanel from './components/ConnectionPanel';
import UploadPanel from './components/UploadPanel';
import StatusPanel from './components/StatusPanel';
import ResultsPanel from './components/ResultsPanel';
import Instructions from './components/Instructions';
import { StatusMessage, UploadHistoryItem } from './types';
import './styles/App.css';
import './styles/components.css';

const App: React.FC = () => {
  const [statusMessages, setStatusMessages] = useState<StatusMessage[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryItem[]>([]);

  // 加载历史记录
  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('ipfs-upload-history') || '[]');
    setUploadHistory(history);
  }, []);

  // 添加上传历史记录
  const addUploadHistory = (type: '文件' | '文本', content: string, cid: string) => {
    const newItem: UploadHistoryItem = {
      type,
      content,
      cid,
      timestamp: new Date().toISOString()
    };

    const newHistory = [newItem, ...uploadHistory.slice(0, 9)]; // 只保留最近的10条
    setUploadHistory(newHistory);
    localStorage.setItem('ipfs-upload-history', JSON.stringify(newHistory));
  };

  // 添加状态消息
  const addStatusMessage = (message: string) => {
    setStatusMessages(prev => [...prev, { id: Date.now(), message }]);
  };

  return (
    <HeliaProvider addStatusMessage={addStatusMessage}>
      <div className="app-container">
        <Header />

        <div className="main-content">
          <div className="panels-container">
            <ConnectionPanel addStatusMessage={addStatusMessage} />

            <UploadPanel
              addStatusMessage={addStatusMessage}
              addUploadHistory={addUploadHistory}
            />
          </div>

          <StatusPanel messages={statusMessages} />

          <ResultsPanel uploadHistory={uploadHistory} />

          <Instructions />
        </div>
      </div>
    </HeliaProvider>
  );
};

export default App;
import React, { useEffect, useRef } from 'react';
import { StatusPanelProps, StatusMessage } from '../types';

const StatusPanel: React.FC<StatusPanelProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 自动滚动到底部
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="panel status-panel">
      <h2 className="panel-title">传输状态</h2>
      <div className="status-container">
        {messages.map((msg) => (
          <div key={msg.id} className="status-message">
            {msg.message}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default StatusPanel;
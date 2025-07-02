import React from 'react';
import ResultItem from './ResultItem';
import { ResultsPanelProps } from '../types';

const ResultsPanel: React.FC<ResultsPanelProps> = ({ uploadHistory }) => {
  return (
    <div className="panel results-panel">
      <h2 className="panel-title">已上传项目</h2>
      <div className="results-container">
        {uploadHistory.length === 0 ? (
          <div className="empty-results">暂无上传记录</div>
        ) : (
          uploadHistory.map((item, index) => (
            <ResultItem
              key={index}
              type={item.type}
              content={item.content}
              cid={item.cid}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ResultsPanel;
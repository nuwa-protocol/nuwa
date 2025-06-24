import React from 'react';
import { ResultItemProps } from '../types';

const ResultItem: React.FC<ResultItemProps> = ({ type, content, cid }) => {
  const handleViewInGateway = () => {
    window.open(`https://ipfs.io/ipfs/${cid}`, '_blank');
  };

  const handleCopyCID = () => {
    navigator.clipboard.writeText(cid);
    alert('CID已复制到剪贴板');
  };

  return (
    <div className="result-item">
      <div className="result-header">
        <span className={`result-type ${type === '文件' ? 'file-type' : 'text-type'}`}>
          {type}
        </span>
        <span className="result-cid">{cid}</span>
      </div>
      <div className="result-content">{content}</div>
      <div className="result-actions">
        <button className="view-ipfs" onClick={handleViewInGateway}>
          在IPFS网关查看
        </button>
        <button className="copy-cid" onClick={handleCopyCID}>
          复制CID
        </button>
      </div>
    </div>
  );
};

export default ResultItem;
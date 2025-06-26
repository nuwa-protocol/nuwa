import React, { useState } from 'react';
import FileUpload from './FileUpload';
import TextUpload from './TextUpload';
import { UploadPanelProps } from '../types';
import {useHelia} from "../context/HeliaProvider";

const UploadPanel: React.FC<UploadPanelProps> = ({
  addStatusMessage,
  addUploadHistory
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const { isConnected, uploadFile, uploadText } = useHelia();

  const handleFileUpload = async (file: File) => {
    if (!isConnected) {
      addStatusMessage('请先连接到go-ipfs节点');
      return;
    }

    try {
      const cid = await uploadFile(file);
      addUploadHistory('文件', file.name, cid);
    } catch (error) {
      addStatusMessage(`文件上传失败: ${(error as Error).message}`);
    }
  };

  const handleTextUpload = async (text: string) => {
    if (!isConnected) {
      addStatusMessage('请先连接到go-ipfs节点');
      return;
    }

    try {
      const cid = await uploadText(text);
      const contentPreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
      addUploadHistory('文本', contentPreview, cid);
    } catch (error) {
      addStatusMessage(`文本上传失败: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel upload-panel">
      <h2 className="panel-title">上传数据</h2>

      <div className="tabs">
        <button
          className={activeTab === 'file' ? 'active' : ''}
          onClick={() => setActiveTab('file')}
        >
          文件上传
        </button>
        <button
          className={activeTab === 'text' ? 'active' : ''}
          onClick={() => setActiveTab('text')}
        >
          文本上传
        </button>
      </div>

      {activeTab === 'file' ? (
        <FileUpload
          onUpload={handleFileUpload}
          disabled={!isConnected}
        />
      ) : (
        <TextUpload
          onUpload={handleTextUpload}
          disabled={!isConnected}
        />
      )}
    </div>
  );
};

export default UploadPanel;
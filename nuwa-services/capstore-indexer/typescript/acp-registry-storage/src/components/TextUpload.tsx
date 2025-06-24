import React, { useState } from 'react';
import { TextUploadProps } from '../types';

const TextUpload: React.FC<TextUploadProps> = ({ onUpload, disabled }) => {
  const [text, setText] = useState<string>('');

  const handleUpload = () => {
    if (!text.trim()) {
      alert('请输入要上传的文本内容');
      return;
    }

    onUpload(text);
    setText('');
  };

  return (
    <div className="input-group">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入要上传的文本内容..."
      />
      <button onClick={handleUpload} disabled={disabled}>
        上传到go-ipfs节点
      </button>
    </div>
  );
};

export default TextUpload;
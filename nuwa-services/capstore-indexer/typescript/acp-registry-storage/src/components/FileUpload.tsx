import React, { useCallback, useState } from 'react';
import { FileUploadProps } from '../types';

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, disabled }) => {
  const [fileName, setFileName] = useState<string>('未选择文件');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFileName(e.target.files[0].name);
    } else {
      setFileName('未选择文件');
    }
  };

  const handleUpload = useCallback(() => {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      alert('请选择文件');
      return;
    }

    onUpload(fileInput.files[0]);
  }, [onUpload]);

  return (
    <div className="input-group">
      <div className="file-upload-container">
        <label htmlFor="fileInput" className="file-upload-label">
          选择文件
          <input
            type="file"
            id="fileInput"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
        <div className="file-info">{fileName}</div>
      </div>
      <button onClick={handleUpload} disabled={disabled}>
        上传到go-ipfs节点
      </button>
    </div>
  );
};

export default FileUpload;
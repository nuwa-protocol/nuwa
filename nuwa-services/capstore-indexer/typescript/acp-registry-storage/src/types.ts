// 状态消息类型
export interface StatusMessage {
  id: number;
  message: string;
}

// 上传历史记录项
export interface UploadHistoryItem {
  type: '文件' | '文本';
  content: string;
  cid: string;
  timestamp: string;
}

// Helia 上下文类型
export interface HeliaContextType {
  helia: any; // 实际应用中可定义更精确的类型
  fs: any;
  isHeliaReady: boolean;
  isConnected: boolean;
  goIpfsPeerId: string | null;
  initializeHelia: () => Promise<void>;
  connectToGoIpfs: (address: string) => Promise<void>;
  uploadFile: (file: File) => Promise<string>;
  uploadText: (text: string) => Promise<string>;
}

// 组件 Props 类型
export interface ConnectionPanelProps {
  addStatusMessage: (message: string) => void;
}

export interface UploadPanelProps {
  addStatusMessage: (message: string) => void;
  addUploadHistory: (type: '文件' | '文本', content: string, cid: string) => void;
}

export interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  disabled: boolean;
}

export interface TextUploadProps {
  onUpload: (text: string) => Promise<void>;
  disabled: boolean;
}

export interface StatusPanelProps {
  messages: StatusMessage[];
}

export interface ResultsPanelProps {
  uploadHistory: UploadHistoryItem[];
}

export interface ResultItemProps {
  type: '文件' | '文本';
  content: string;
  cid: string;
}

// HeliaProvider Props
export interface HeliaProviderProps {
  children: React.ReactNode;
  addStatusMessage: (message: string) => void;
}
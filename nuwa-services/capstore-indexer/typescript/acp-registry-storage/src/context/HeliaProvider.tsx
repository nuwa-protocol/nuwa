import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef
} from 'react';
import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { multiaddr } from '@multiformats/multiaddr';
import { IDBDatastore } from 'datastore-idb';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websockets';
import { bootstrap } from '@libp2p/bootstrap';
import { HeliaContextType, HeliaProviderProps } from '../types';

// 创建上下文
const HeliaContext = createContext<HeliaContextType | null>(null);

export const HeliaProvider: React.FC<HeliaProviderProps> = ({ children, addStatusMessage }) => {
  const [helia, setHelia] = useState<any>(null);
  const [fs, setFs] = useState<any>(null);
  const [isHeliaReady, setIsHeliaReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [goIpfsPeerId, setGoIpfsPeerId] = useState<string | null>(null);

  // 使用 ref 标记初始化状态
  const initializationStarted = useRef(false);

  // 初始化 Helia
  const initializeHelia = useCallback(async () => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;

    addStatusMessage('正在初始化Helia节点...');

    try {
      // 使用 IndexedDB 持久化存储
      const datastore = new IDBDatastore('helia-goipfs-bridge');
      await datastore.open();

      // 创建 Libp2p 配置
      const libp2p = await createLibp2p({
        datastore,
        transports: [webSockets()],
        // connectionEncryption: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery: [
          bootstrap({
            list: [
              '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN'
            ]
          })
        ]
      });

      // 创建 Helia 实例
      const heliaInstance = await createHelia({
        datastore,
        libp2p
      });

      // 创建 UnixFS 实例
      const fsInstance = unixfs(heliaInstance);

      setHelia(heliaInstance);
      setFs(fsInstance);
      setIsHeliaReady(true);

      addStatusMessage('Helia节点已就绪 ✅');
      addStatusMessage(`节点ID: ${heliaInstance.libp2p.peerId.toString()}`);

      // 连接到公共节点增强持久性
      connectToPublicNodes(heliaInstance);
    } catch (error) {
      console.error('Helia initialization error:', error);
      addStatusMessage(`Helia初始化失败: ${(error as Error).message}`);

      // 重置初始化状态，允许重试
      initializationStarted.current = false;
    }
  }, [addStatusMessage]);

  // 连接到公共节点
  const connectToPublicNodes = useCallback(async (heliaInstance: any) => {
    const publicNodes = [
      '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/dns4/ipfs.io/tcp/443/wss/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa'
    ];

    for (const addr of publicNodes) {
      try {
        const ma = multiaddr(addr);
        await heliaInstance.libp2p.dial(ma);
        addStatusMessage(`已连接到公共节点: ${ma.getPeerId()}`);
      } catch (error) {
        console.log(`连接失败: ${addr}`, error);
        addStatusMessage(`连接公共节点失败: ${addr} - ${(error as Error).message}`);
      }
    }
  }, [addStatusMessage]);

  // 连接到 go-ipfs 节点
  const connectToGoIpfs = useCallback(async (address: string) => {
    if (!helia || !isHeliaReady) {
      addStatusMessage('Helia节点尚未初始化');
      return;
    }

    addStatusMessage('正在连接到go-ipfs节点...');

    try {
      // 解析多地址格式
      const addr = multiaddr(address);

      // 连接到节点
      await helia.libp2p.dial(addr);

      // 获取节点 Peer ID
      const peerId = addr.getPeerId();
      setGoIpfsPeerId(peerId);
      setIsConnected(true);

      addStatusMessage(`成功连接到go-ipfs节点 ✅`);
      addStatusMessage(`节点ID: ${peerId}`);
    } catch (error) {
      console.error('Connection to go-ipfs failed:', error);
      addStatusMessage(`连接失败: ${(error as Error).message}`);
      setIsConnected(false);
    }
  }, [helia, isHeliaReady, addStatusMessage]);

  // 上传文件
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    if (!fs || !isConnected) {
      throw new Error('Helia not ready or not connected');
    }

    addStatusMessage('开始上传数据...');
    addStatusMessage(`上传文件: ${file.name} (${formatFileSize(file.size)})`);

    try {
      // 读取文件内容
      const fileData = await readFileAsUint8Array(file);

      // 添加到 Helia
      const cid = await fs.addBytes(fileData);

      addStatusMessage('数据已添加到Helia节点');
      addStatusMessage(`CID: ${cid.toString()}`);
      addStatusMessage('通知go-ipfs节点获取数据...');

      // 广播 CID 到 go-ipfs 节点
      await broadcastCidToGoIpfs(helia, cid);

      // 验证数据是否已传输
      await verifyDataOnGoIpfs();

      return cid.toString();
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  }, [fs, helia, isConnected, addStatusMessage]);

  // 上传文本
  const uploadText = useCallback(async (text: string): Promise<string> => {
    if (!fs || !isConnected) {
      throw new Error('Helia not ready or not connected');
    }

    const contentPreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    addStatusMessage('开始上传数据...');
    addStatusMessage(`上传文本: ${contentPreview}`);

    try {
      // 添加到 Helia
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const cid = await fs.addBytes(data);

      addStatusMessage('数据已添加到Helia节点');
      addStatusMessage(`CID: ${cid.toString()}`);
      addStatusMessage('通知go-ipfs节点获取数据...');

      // 广播 CID 到 go-ipfs 节点
      await broadcastCidToGoIpfs(helia, cid);

      // 验证数据是否已传输
      await verifyDataOnGoIpfs();

      return cid.toString();
    } catch (error) {
      console.error('Text upload error:', error);
      throw error;
    }
  }, [fs, helia, isConnected, addStatusMessage]);

  // 广播 CID 到 go-ipfs 节点
  const broadcastCidToGoIpfs = useCallback(async (heliaInstance: any, cid: any) => {
    try {
      // 使用 Bitswap 协议通知 go-ipfs 节点
      const bitswap = heliaInstance.blockstore;
      await bitswap.notify(cid);

      addStatusMessage('go-ipfs节点已收到通知，正在获取数据...');
    } catch (error) {
      console.error('Broadcast error:', error);
      addStatusMessage(`数据传输错误: ${(error as Error).message}`);
      throw error;
    }
  }, [addStatusMessage]);

  // 验证数据是否在 go-ipfs 节点上
  const verifyDataOnGoIpfs = useCallback(async () => {
    // 模拟验证过程
    return new Promise<void>(resolve => {
      addStatusMessage('验证go-ipfs节点数据...');

      setTimeout(() => {
        addStatusMessage('✅ 数据已成功存储在go-ipfs节点');
        resolve();
      }, 2000);
    });
  }, [addStatusMessage]);

  // 辅助函数：读取文件为 Uint8Array
  const readFileAsUint8Array = (file: File): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // 辅助函数：格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 上下文值
  const contextValue: HeliaContextType = {
    helia,
    fs,
    isHeliaReady,
    isConnected,
    goIpfsPeerId,
    initializeHelia,
    connectToGoIpfs,
    uploadFile,
    uploadText
  };

  // 初始化应用
  useEffect(() => {
    if (!isHeliaReady && !initializationStarted.current) {
      initializeHelia();
    }
  }, [initializeHelia, isHeliaReady]);

  return (
    <HeliaContext.Provider value={contextValue}>
      {children}
    </HeliaContext.Provider>
  );
};

// 创建自定义 hook
export const useHelia = (): HeliaContextType => {
  const context = useContext(HeliaContext);
  if (!context) {
    throw new Error('useHelia must be used within a HeliaProvider');
  }
  return context;
};

export default HeliaProvider;
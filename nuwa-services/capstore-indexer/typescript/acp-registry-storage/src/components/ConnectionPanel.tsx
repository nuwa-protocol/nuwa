import React, { useState } from 'react';
import { useHelia } from '../context/HeliaProvider';
import { ConnectionPanelProps } from '../types';

const ConnectionPanel: React.FC<ConnectionPanelProps> = ({ addStatusMessage }) => {
  const [address, setAddress] = useState<string>('/ip4/127.0.0.1/tcp/4001');
  const { isConnected, goIpfsPeerId, connectToGoIpfs } = useHelia();

  const handleConnect = async () => {
    try {
      await connectToGoIpfs(address);
      localStorage.setItem('last-goipfs-address', address);
    } catch (error) {
      addStatusMessage(`连接失败: ${(error as Error).message}`);
    }
  };

  return (
    <div className="panel connection-panel">
      <h2 className="panel-title">连接到go-ipfs节点</h2>
      <div className="input-group">
        <label htmlFor="goIpfsAddress">go-ipfs节点地址:</label>
        <input
          type="text"
          id="goIpfsAddress"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="/ip4/127.0.0.1/tcp/4001"
        />
        <p className="help-text">格式: /ip4/[IP地址]/tcp/[端口]/p2p/[PeerID]</p>
      </div>
      <button
        onClick={handleConnect}
        className={isConnected ? 'connected' : ''}
        disabled={isConnected}
      >
        {isConnected ? '已连接' : '连接到go-ipfs节点'}
      </button>
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        <span className="status-indicator"></span>
        <span>
          {isConnected
            ? `已连接到go-ipfs节点: ${goIpfsPeerId}`
            : '未连接到go-ipfs节点'}
        </span>
      </div>
    </div>
  );
};

export default ConnectionPanel;
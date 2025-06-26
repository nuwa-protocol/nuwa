import React from 'react';

const Instructions: React.FC = () => {
  return (
    <div className="instructions">
      <h3>使用说明</h3>
      <ol>
        <li><strong>连接到go-ipfs节点</strong>：输入您的go-ipfs节点地址（格式：<code>/ip4/127.0.0.1/tcp/4001/p2p/Qm...</code>）</li>
        <li><strong>选择数据</strong>：上传文件或在文本框中输入内容</li>
        <li><strong>上传数据</strong>：点击"上传到go-ipfs节点"按钮</li>
        <li><strong>查看数据</strong>：上传成功后，点击"在IPFS网关查看"按钮访问数据</li>
      </ol>
      <p><strong>注意</strong>：要使用此工具，您的go-ipfs节点必须允许来自Helia节点的连接，并启用Bitswap协议。</p>
    </div>
  );
};

export default Instructions;
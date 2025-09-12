// Main exports
export { PaymentChannelMcpClient } from './PaymentChannelMcpClient';
export { McpChannelManager } from './McpChannelManager';

// Types
export type { McpPayerOptions } from './PaymentChannelMcpClient';

// Factory functions (recommended: use createMcpClient with IdentityEnv)
export { createMcpClient } from './factory';
export type { CreateMcpClientOptions, CreateMcpPayerClientOptions } from './factory';

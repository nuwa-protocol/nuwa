// ===== Core Types =====
export type {
  NuwaPaymentInfo,
  EnhancedServerCapabilities,
  ServerDetectionResult,
  DetectionOptions,
  UniversalListToolsOptions,
} from './types';
export { McpServerType } from './types';

// ===== Core Classes =====
export { ServerDetector } from './ServerDetector';
export { UniversalMcpClient } from './UniversalMcpClient';

// ===== Legacy Classes (for backward compatibility) =====
export { PaymentChannelMcpClient } from './PaymentChannelMcpClient';
export type {
  McpPayerOptions,
  ListToolsOptions as PaymentListToolsOptions,
} from './PaymentChannelMcpClient';

// ===== Factory Functions =====
export { createMcpClient, createPaymentMcpClient, createStandardMcpClient } from './factory';
export type { CreateMcpClientOptions, CreateMcpPayerClientOptions } from './factory';

// ===== Backward Compatibility Type Aliases =====
import type { UniversalMcpClient } from './UniversalMcpClient';
import type { UniversalListToolsOptions } from './types';

/**
 * @deprecated Use UniversalMcpClient instead. This type alias is provided for backward compatibility.
 */
export type PaymentChannelMcpClientType = UniversalMcpClient;

/**
 * @deprecated Use UniversalListToolsOptions instead. This type alias is provided for backward compatibility.
 */
export type ListToolsOptions = UniversalListToolsOptions;

// ===== Re-exports for convenience =====
export type { PaymentResult, PaymentInfo } from '../../core/types';
export type { Tool, ToolSet, ToolCallOptions } from 'ai';
export type { ZodTypeAny } from 'zod';

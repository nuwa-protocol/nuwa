import type { AgentDIDCreationStatus } from '@cadop/shared';
import { AuthMethod } from '../storage/types';

/**
 * Agent service interface
 *
 * Defines the contract for creating and managing Agent DIDs
 */
export interface IAgentService {
  /** Authentication method this service supports */
  readonly authMethod: AuthMethod;

  /**
   * Get cached Agent DIDs for a user
   * @param userDid User DID
   * @returns Array of Agent DIDs
   */
  getCachedAgentDIDs(userDid: string): string[];

  /**
   * Create a new Agent DID
   * @param userDid User DID
   * @param interactive Whether to allow interactive authentication
   * @returns Agent creation status
   */
  createAgent(userDid: string, interactive?: boolean): Promise<AgentDIDCreationStatus>;

  /**
   * Check if this service can create agents for the given user
   * @param userDid User DID
   * @returns Whether agent creation is supported
   */
  canCreateAgent(userDid: string): boolean;
}

/**
 * Unified Agent service interface
 *
 * Manages Agent creation across different authentication methods
 */
export interface IUnifiedAgentService {
  /**
   * Get cached Agent DIDs for a user
   * @param userDid User DID
   * @returns Array of Agent DIDs
   */
  getCachedAgentDIDs(userDid: string): string[];

  /**
   * Create a new Agent DID (auto-detects auth method)
   * @param userDid User DID
   * @param interactive Whether to allow interactive authentication
   * @returns Agent creation status
   */
  createAgent(userDid: string, interactive?: boolean): Promise<AgentDIDCreationStatus>;

  /**
   * Get appropriate agent service for a user
   * @param userDid User DID
   * @returns Agent service instance
   */
  getAgentService(userDid: string): IAgentService;

  /**
   * Register an agent service for an authentication method
   * @param authMethod Authentication method
   * @param service Agent service instance
   */
  registerAgentService(authMethod: AuthMethod, service: IAgentService): void;
}

/**
 * Agent service factory function type
 */
export type AgentServiceFactory = () => IAgentService;

export interface Agent {
    id: string                 // Agent Object ID
    address: string           // Agent address (bech32 format)
    name: string              // Display name
    username: string         // Agent username
    description: string       // Description
    instructions: string      // Agent instructions
    agent_address: string     // Agent address (on-chain address)
    avatar: string            // Avatar URL
    lastActive: string        // Last active time in ISO string format
    createdAt: string         // Creation time in ISO string format
    modelProvider: string     // Model provider
    prompt?: string          // Agent prompt (optional)
    isFeatured: boolean      // Whether the agent is featured
    isTrending: boolean      // Whether the agent is trending
}

export interface AgentStatus {
    isOnline: boolean;
    lastActive: number;
    currentTask?: string;
}

export interface AgentCapabilities {
    canChat: boolean;
    canCreateChannels: boolean;
    canManageMembers: boolean;
    canSendMessages: boolean;
}

export interface AgentWithStatus extends Agent {
    status: AgentStatus;
    capabilities: AgentCapabilities;
}

export interface AgentCreateParams {
    name: string;
    username: string;
    description: string;
    instructions: string;
    avatar?: string;
    model_provider: string;
    prompt?: string;
}

export interface Memory {
    index: number;
    content: string;
    context: string;
    timestamp: number;
} 
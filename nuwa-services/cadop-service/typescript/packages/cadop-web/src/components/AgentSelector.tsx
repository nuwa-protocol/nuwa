import React, { useState, useEffect } from 'react';
import { Select, Spin } from 'antd';
import { useAuth } from '../lib/auth/AuthContext';
import { UserStore } from '../lib/storage';

const { Option } = Select;

interface AgentSelectorProps {
  onSelect: (did: string) => void;
}

export function AgentSelector({ onSelect }: AgentSelectorProps) {
  const { userDid } = useAuth();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);

  useEffect(() => {
    if (userDid) {
      loadAgents();
    }
  }, [userDid]);

  const loadAgents = async () => {
    if (!userDid) return;

    setLoading(true);
    try {
      // Get agent DIDs from local storage
      const agentDids = UserStore.listAgents(userDid);
      setAgents(agentDids || []);
    } catch (error) {
      console.error('Failed to load agents from storage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (value: string) => {
    onSelect(value);
  };

  return (
    <Select
      placeholder="Select an Agent DID"
      loading={loading}
      style={{ width: '100%' }}
      onChange={handleChange}
    >
      {agents.map(agent => (
        <Option key={agent} value={agent}>
          {agent}
        </Option>
      ))}
    </Select>
  );
}

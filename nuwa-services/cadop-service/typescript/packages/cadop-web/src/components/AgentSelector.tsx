import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SpinnerContainer,
} from '@/components/ui';
import { useAuth } from '../lib/auth/AuthContext';
import { UserStore } from '../lib/storage';

interface AgentSelectorProps {
  onSelect: (did: string) => void;
  /**
   * Whether to automatically select the first agent in the list when the component mounts.
   * Defaults to true. Pass false if you want the user to make an explicit choice each time.
   */
  autoSelectFirst?: boolean;
}

export function AgentSelector({ onSelect, autoSelectFirst = true }: AgentSelectorProps) {
  const { userDid } = useAuth();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | undefined>();

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

      if (agentDids && agentDids.length > 0) {
        if (autoSelectFirst) {
          // Auto-select the first agent to reduce one user action
          setSelected(agentDids[0]);
          onSelect(agentDids[0]);
        } else {
          setSelected(undefined);
        }
      } else {
        setSelected(undefined);
      }
    } catch (error) {
      console.error('Failed to load agents from storage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (value: string) => {
    setSelected(value);
    onSelect(value);
  };

  return (
    <SpinnerContainer loading={loading}>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select an Agent DID" />
        </SelectTrigger>
        <SelectContent>
          {agents.map(agent => (
            <SelectItem key={agent} value={agent}>
              {agent}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SpinnerContainer>
  );
}

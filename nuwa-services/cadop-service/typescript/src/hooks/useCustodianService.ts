import { useState, useCallback } from 'react';
import type { DIDCreationStatus, CADOPMintRequest } from '../services/custodianService';

export interface CustodianServiceState {
  loading: boolean;
  error: string | null;
  didCreationStatus: DIDCreationStatus | null;
}

export const useCustodianService = () => {
  const [state, setState] = useState<CustodianServiceState>({
    loading: false,
    error: null,
    didCreationStatus: null
  });

  const createAgentDID = useCallback(async (request: CADOPMintRequest) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch('/api/custodian/mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create Agent DID');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        loading: false,
        didCreationStatus: result.data
      }));

      return result.data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      throw error;
    }
  }, []);

  const getCreationStatus = useCallback(async (recordId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch(`/api/custodian/status/${recordId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get status');
      }

      const result = await response.json();
      
      setState(prev => ({
        ...prev,
        loading: false,
        didCreationStatus: result.data
      }));

      return result.data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      throw error;
    }
  }, []);

  const getUserAgentDIDs = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const response = await fetch('/api/custodian/user/dids');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get user DIDs');
      }

      const result = await response.json();
      
      setState(prev => ({ ...prev, loading: false }));
      
      return result.data;
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      throw error;
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const clearStatus = useCallback(() => {
    setState(prev => ({ ...prev, didCreationStatus: null }));
  }, []);

  return {
    ...state,
    createAgentDID,
    getCreationStatus,
    getUserAgentDIDs,
    clearError,
    clearStatus,
  };
}; 
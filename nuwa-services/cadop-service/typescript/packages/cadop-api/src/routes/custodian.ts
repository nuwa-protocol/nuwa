import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';

const router: Router = Router();

// Validation schemas
const CADOPMintRequestSchema = z.object({
  idToken: z.string().min(1, 'ID token is required'),
  userDid: z.string().min(1, 'User DID is required'),
});

const DIDRecordIdSchema = z.object({
  recordId: z.string().uuid('Invalid record ID format')
});

const UserIdSchema = z.object({
  userId: z.string().min(1, 'User ID is required')
});

const AgentDIDSchema = z.object({
  agentDid: z.string().regex(/^did:rooch:/, 'Invalid Agent DID format')
});

/**
 * POST /api/custodian/mint
 * Create a new Agent DID via CADOP protocol
 */
router.post('/mint', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validatedData = CADOPMintRequestSchema.parse(req.body);
    
    logger.info('Received CADOP mint request', {
      hasIdToken: !!validatedData.idToken,
      userDid: validatedData.userDid
    });

    const container = ServiceContainer.getInstance();
    const custodianService = await container.getCustodianService();

    // Create Agent DID via CADOP
    const result = await custodianService.createAgentDIDViaCADOP({
      idToken: validatedData.idToken,
      userDid: validatedData.userDid,
    });
    
    logger.info('CADOP mint request processed', {
      recordId: result.id,
      status: result.status
    });

    res.status(201).json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('CADOP mint request failed', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    } else {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/custodian/status/:recordId
 * Get DID creation status by record ID
 */
router.get('/status/:recordId', async (req: Request, res: Response) => {
  try {
    // Validate path parameter
    const { recordId } = DIDRecordIdSchema.parse({ recordId: req.params['recordId'] });
    
    const container = ServiceContainer.getInstance();
    const custodianService = await container.getCustodianService();
    const status = await custodianService.getDIDCreationStatus(recordId);
    
    if (!status) {
      res.status(404).json({
        success: false,
        error: 'DID creation record not found'
      });
      return;
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Failed to get DID creation status', { 
      recordId: req.params['recordId'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid record ID format'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/custodian/user/:userId/dids
 * Get all Agent DIDs for a user
 */
router.get('/user/:userId/dids', async (req: Request, res: Response) => {
  try {
    // Validate path parameter
    const { userId } = UserIdSchema.parse({ userId: req.params['userId'] });
    
    const container = ServiceContainer.getInstance();
    const custodianService = await container.getCustodianService();
    const dids = await custodianService.getUserAgentDIDs(userId);
    
    res.json({
      success: true,
      data: dids
    });

  } catch (error) {
    logger.error('Failed to get user Agent DIDs', { 
      userId: req.params['userId'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/custodian/resolve/:agentDid
 * Resolve Agent DID document
 */
router.get('/resolve/:agentDid', async (req: Request, res: Response) => {
  try {
    // Validate path parameter
    const { agentDid } = AgentDIDSchema.parse({ agentDid: req.params['agentDid'] });
    
    const container = ServiceContainer.getInstance();
    const custodianService = await container.getCustodianService();
    const didDocument = await custodianService.resolveAgentDID(agentDid);
    
    if (!didDocument) {
      res.status(404).json({
        success: false,
        error: 'Agent DID not found'
      });
      return;
    }

    res.json({
      success: true,
      data: didDocument
    });

  } catch (error) {
    logger.error('Failed to resolve Agent DID', { 
      agentDid: req.params['agentDid'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid Agent DID format'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/custodian/exists/:agentDid
 * Check if Agent DID exists
 */
router.get('/exists/:agentDid', async (req: Request, res: Response) => {
  try {
    // Validate path parameter
    const { agentDid } = AgentDIDSchema.parse({ agentDid: req.params['agentDid'] });
    
    const container = ServiceContainer.getInstance();
    const custodianService = await container.getCustodianService();
    const exists = await custodianService.agentDIDExists(agentDid);
    
    res.json({
      success: true,
      data: { exists }
    });

  } catch (error) {
    logger.error('Failed to check Agent DID existence', { 
      agentDid: req.params['agentDid'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid Agent DID format'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/custodian/health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Basic health check - could be extended to check Rooch network connectivity
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'custodian-service'
      }
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(500).json({
      success: false,
      error: 'Service unhealthy'
    });
  }
});

export default router; 
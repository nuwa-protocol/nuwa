import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';
import {
  CadopError,
  CadopErrorCode,
  createErrorResponse,
  createSuccessResponse,
  createErrorResponseFromError,
  CADOPMintRequestSchema,
  DIDRecordIdSchema,
  UserIdSchema,
  AgentDIDSchema
} from '@cadop/shared';

const router: Router = Router();

// Helper function to handle errors
const handleError = (error: unknown): { status: number; response: any } => {
  logger.error('API Error:', { error });
  
  if (error instanceof CadopError) {
    return {
      status: 400,
      response: createErrorResponse(error.message, error.code, error.details)
    };
  }
  
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      response: createErrorResponse('Validation error', CadopErrorCode.VALIDATION_ERROR, error.errors)
    };
  }
  
  if (error instanceof Error) {
    return {
      status: 500,
      response: createErrorResponse(error.message, CadopErrorCode.INTERNAL_ERROR)
    };
  }
  
  return {
    status: 500,
    response: createErrorResponse('Unknown error occurred', CadopErrorCode.INTERNAL_ERROR)
  };
};

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

    const container = await ServiceContainer.getInstance();
    const custodianService = container.getCustodianService();

    // Create Agent DID via CADOP
    const result = await custodianService.createAgentDIDViaCADOP({
      idToken: validatedData.idToken,
      userDid: validatedData.userDid,
    });
    
    logger.info('CADOP mint request processed', {
      recordId: result.id,
      status: result.status
    });

    res.status(201).json(createSuccessResponse(result));

  } catch (error) {
    logger.error('CADOP mint request failed', { 
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const { status, response } = handleError(error);
    res.status(status).json(response);
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
    
    const container = await ServiceContainer.getInstance();
    const custodianService = container.getCustodianService();
    const status = await custodianService.getDIDCreationStatus(recordId);
    
    if (!status) {
      return res.status(404).json(createErrorResponse(
        'DID creation record not found',
        CadopErrorCode.NOT_FOUND
      ));
    }

    res.json(createSuccessResponse(status));

  } catch (error) {
    logger.error('Failed to get DID creation status', { 
      recordId: req.params['recordId'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const { status, response } = handleError(error);
    res.status(status).json(response);
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
    
    const container = await ServiceContainer.getInstance();
    const custodianService = container.getCustodianService();
    const dids = await custodianService.getUserAgentDIDs(userId);
    
    res.json(createSuccessResponse({ dids }));

  } catch (error) {
    logger.error('Failed to get user Agent DIDs', { 
      userId: req.params['userId'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const { status, response } = handleError(error);
    res.status(status).json(response);
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
    
    const container = await ServiceContainer.getInstance();
    const custodianService = container.getCustodianService();
    const didDocument = await custodianService.resolveAgentDID(agentDid);
    
    if (!didDocument) {
      return res.status(404).json(createErrorResponse(
        'Agent DID not found',
        CadopErrorCode.NOT_FOUND
      ));
    }

    res.json(createSuccessResponse(didDocument));

  } catch (error) {
    logger.error('Failed to resolve Agent DID', { 
      agentDid: req.params['agentDid'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const { status, response } = handleError(error);
    res.status(status).json(response);
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
    
    const container = await ServiceContainer.getInstance();
    const custodianService = container.getCustodianService();
    const exists = await custodianService.agentDIDExists(agentDid);
    
    res.json(createSuccessResponse({ exists }));

  } catch (error) {
    logger.error('Failed to check Agent DID existence', { 
      agentDid: req.params['agentDid'],
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    const { status, response } = handleError(error);
    res.status(status).json(response);
  }
});

export default router; 
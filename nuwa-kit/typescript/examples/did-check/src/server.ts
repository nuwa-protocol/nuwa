// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { DebugLogger, IdentityKit, DIDAuth, VDRRegistry } from '@nuwa-ai/identity-kit';
import type { Request, Response, NextFunction } from 'express';

/**
 * Simple HTTP server demonstrating Identity Kit integration for DID authentication
 *
 * This example shows how to:
 * 1. Set up IdentityKit for DID operations
 * 2. Create a DID authentication middleware for Express
 * 3. Define protected routes that require DID authentication
 * 4. Define public routes without authentication
 */

// Extend Express Request to include caller DID information
declare global {
    namespace Express {
        interface Request {
            callerDid?: string;
            callerKeyId?: string;
        }
    }
}

interface ServerConfig {
    port: number;
    debug: boolean;
}

/**
 * Creates Express middleware for DID authentication
 * Verifies the Authorization header using DIDAuth.v1.verifyAuthHeader()
 */
function createDIDAuthMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            res.status(401).json({
                error: 'Missing authorization header',
                hint: 'Use Authorization: DIDAuthV1 <base64url-encoded-signed-object>',
            });
            return;
        }

        try {
            // Verify the DID authentication header
            const result = await DIDAuth.v1.verifyAuthHeader(authHeader, VDRRegistry.getInstance());

            if (!result.ok) {
                res.status(401).json({
                    error: result.error,
                    errorCode: result.errorCode,
                });
                return;
            }

            // Attach verified DID info to request object
            req.callerDid = result.signedObject.signature.signer_did;
            req.callerKeyId = result.signedObject.signature.key_id;

            console.log(`✅ Authenticated request from DID: ${req.callerDid}`);
            next();
        } catch (error) {
            console.error('❌ Authentication error:', error);
            res.status(500).json({
                error: 'Authentication verification failed',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
}

async function createServer(config: ServerConfig): Promise<{
    app: express.Application;
}> {
    const app = express();
    app.use(express.json());

    // Initialize VDR for DID resolution (no service key needed for verification only)
    await IdentityKit.bootstrap({
        method: 'rooch',
        vdrOptions: {
            rpcUrl: process.env.ROOCH_NODE_URL,
            network: process.env.ROOCH_NETWORK || 'main',
        },
    });

    console.log('🔑 VDR initialized for DID resolution');

    // Set debug level if enabled
    if (config.debug) {
        console.log('🔍 Setting debug level to debug');
        DebugLogger.setGlobalLevel('debug');
    }

    // Create the DID auth middleware
    const didAuthMiddleware = createDIDAuthMiddleware();

    // ==========================================
    // PUBLIC ENDPOINTS (No authentication required)
    // ==========================================

    // Health check endpoint
    app.get('/health', (req: Request, res: Response) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
        });
    });

    // Service info endpoint - provides public service information
    app.get('/info', (req: Request, res: Response) => {
        res.json({
            network: process.env.ROOCH_NETWORK || 'main',
            version: '1.0.0',
            endpoints: {
                public: ['/health', '/info'],
                protected: ['/whoami'],
            },
        });
    });

    // ==========================================
    // PROTECTED ENDPOINTS (Require DID authentication)
    // ==========================================

    // Who am I endpoint - returns the authenticated caller's DID info
    app.get('/whoami', didAuthMiddleware, (req: Request, res: Response) => {
        res.json({
            callerDid: req.callerDid,
            callerKeyId: req.callerKeyId,
            message: 'You are authenticated!',
            timestamp: new Date().toISOString(),
        });
    });

    // Error handling middleware
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        console.error('🚨 Server error occurred:');
        console.error('Request URL:', req.method, req.url);
        console.error('Error details:', err);
        console.error('Error stack:', err.stack);

        res.status(500).json({
            error: 'Internal server error',
            message: err.message,
            ...(config.debug && { stack: err.stack }),
        });
    });

    return { app };
}

async function main() {
    const config: ServerConfig = {
        port: parseInt(process.env.PORT || '3004'),
        debug: process.env.DEBUG === 'true',
    };

    try {
        const { app } = await createServer(config);

        const server = app.listen(config.port, () => {
            console.log(`🚀 Identity server running on port ${config.port}`);
            console.log(`🔍 Health check: http://localhost:${config.port}/health`);
            console.log(`📋 Service info: http://localhost:${config.port}/info`);
            console.log(`🔐 Protected endpoints require DIDAuthV1 authorization`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 Received SIGTERM, shutting down gracefully');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });

        process.on('SIGINT', () => {
            console.log('🛑 Received SIGINT, shutting down gracefully');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start server if run directly
// Using ES module check instead of CommonJS require.main
main().catch(console.error);

export { createServer, createDIDAuthMiddleware };

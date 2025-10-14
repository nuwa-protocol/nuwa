import express, { Application } from 'express';
import request from 'supertest';
import { createExpressPaymentKit } from '../../../src/transport/express/ExpressPaymentKit';

// Mock signer for testing
const mockSigner = {
  getDid: () => 'did:rooch:test',
  sign: () => Promise.resolve(new Uint8Array(64)),
} as any;

describe('ExpressPaymentKit Integration', () => {
  let app: Application;
  let paymentKit: any;

  beforeAll(async () => {
    // Create Express app
    app = express();
    app.use(express.json());

    // Create PaymentKit instance
    paymentKit = await createExpressPaymentKit({
      serviceId: 'test-service',
      signer: mockSigner,
      network: 'test',
      debug: false,
    });

    // Register test routes

    // Free route
    paymentKit.get(
      '/api/health',
      {
        pricing: '0',
        authRequired: false,
      },
      (req: any, res: any) => {
        res.json({ status: 'healthy' });
      }
    );

    // Parameter route
    paymentKit.get(
      '/api/users/:id',
      {
        pricing: '0', // Keep it free to avoid auth complexity
        authRequired: false,
      },
      (req: any, res: any) => {
        res.json({ userId: req.params.id });
      }
    );

    // RegExp route
    paymentKit.get(
      /^\/api\/v(\d+)\/status$/,
      {
        pricing: '0', // Keep it free
        authRequired: false,
      },
      (req: any, res: any) => {
        res.json({ version: 'test' });
      }
    );

    // Mount PaymentKit router
    app.use(paymentKit.router);
  }, 15000);

  afterAll(async () => {
    // Minimal cleanup
    if (paymentKit?.cleanup) {
      await paymentKit.cleanup();
    }
  });

  describe('Basic Routing', () => {
    it('should handle string paths', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body.status).toBe('healthy');
    });

    it('should handle parameter paths', async () => {
      const response = await request(app).get('/api/users/123').expect(200);

      expect(response.body.userId).toBe('123');
    });

    it('should handle RegExp paths', async () => {
      const response = await request(app).get('/api/v1/status').expect(200);

      expect(response.body.version).toBe('test');
    });

    it('should return 404 for unmatched routes', async () => {
      await request(app).get('/nonexistent').expect(404);
    });
  });
});

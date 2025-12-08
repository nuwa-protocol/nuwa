import request from 'supertest';
import express from 'express';
import { healthRouter } from '../health.js';

const app = express();
app.use('/health', healthRouter);

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app).get('/health/live').expect(200);

      expect(response.body).toHaveProperty('status', 'ALIVE');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});

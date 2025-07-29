import { describe, it, expect, beforeEach } from '@jest/globals';
import { BillableRouter } from '../BillableRouter';

describe('ExpressBillingKit Timing Fix Verification', () => {
  describe('Rule registration timing', () => {
    it('should demonstrate the timing fix with BillableRouter', () => {
      console.log('\n🔧 Verifying timing fix...');
      
      // Step 1: Create BillableRouter (simulating ExpressBillingKit constructor)
      const router = new BillableRouter({
        serviceId: 'test-service',
        defaultPricePicoUSD: '500000000' // 0.0005 USD
      });

      // Check initial state (only default rule)
      const initialRules = router.getRules();
      console.log('Step 1 - Initial rule count:', initialRules.length);
      console.log('Initial rules:', initialRules.map(r => ({ id: r.id, isDefault: r.default, price: r.strategy.price })));

      // Step 2: Register routes (simulating user code)
      router.get('/v1/echo', '1000000000', (req, res) => res.json({ echo: 'test' }));
      router.post('/v1/process', '10000000000', (req, res) => res.json({ processed: true }));

      // Check state after registration
      const finalRules = router.getRules();
      console.log('Step 2 - Rule count after registration:', finalRules.length);
      console.log('Final rules:', finalRules.map(r => ({ 
        id: r.id, 
        path: r.when?.path,
        method: r.when?.method,
        isDefault: r.default, 
        price: r.strategy.price 
      })));

      // Step 3: Verify ConfigLoader can see all rules (simulating delayed initialization)
      const configLoader = router.getConfigLoader();
      
      return configLoader.load('test-service').then(config => {
        console.log('Step 3 - ConfigLoader returned rule count:', config.rules.length);
        
        // Verify: should have 3 rules (2 specific + 1 default)
        expect(config.rules.length).toBe(3);
        
        // Verify specific rules exist
        const echoRule = config.rules.find(r => r.when?.path === '/v1/echo' && r.when?.method === 'GET');
        const processRule = config.rules.find(r => r.when?.path === '/v1/process' && r.when?.method === 'POST');
        const defaultRule = config.rules.find(r => r.default === true);

        expect(echoRule).toBeTruthy();
        expect(echoRule?.strategy.price).toBe('1000000000'); // 0.001 USD
        
        expect(processRule).toBeTruthy();
        expect(processRule?.strategy.price).toBe('10000000000'); // 0.01 USD
        
        expect(defaultRule).toBeTruthy();
        expect(defaultRule?.strategy.price).toBe('500000000'); // 0.0005 USD

        console.log('✅ Timing fix verification successful!');
        console.log('- Specific route rules correctly registered');
        console.log('- ConfigLoader can see all rules');
        console.log('- Rule priority correct (specific rules first, default rule last)');
      });
    });

    it('should verify rule order is correct for billing engine', async () => {
      const router = new BillableRouter({
        serviceId: 'order-test',
        defaultPricePicoUSD: '100000000' // 0.0001 USD default
      });

      // Register routes with specific prices
      router.get('/v1/expensive', '5000000000', (req, res) => res.json({})); // 0.005 USD
      router.post('/v1/cheap', '200000000', (req, res) => res.json({}));      // 0.0002 USD

      const configLoader = router.getConfigLoader();
      const config = await configLoader.load('order-test');

      // Verify rule order: specific rules first, default rule last
      expect(config.rules[0].when?.path).toBe('/v1/expensive');
      expect(config.rules[0].when?.method).toBe('GET');
      expect(config.rules[0].strategy.price).toBe('5000000000');

      expect(config.rules[1].when?.path).toBe('/v1/cheap');
      expect(config.rules[1].when?.method).toBe('POST');
      expect(config.rules[1].strategy.price).toBe('200000000');

      expect(config.rules[2].default).toBe(true);
      expect(config.rules[2].strategy.price).toBe('100000000');

      console.log('✅ Rule order verification passed');
    });
  });
}); 
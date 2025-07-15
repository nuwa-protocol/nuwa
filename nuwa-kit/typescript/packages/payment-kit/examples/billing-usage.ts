/**
 * Example usage of the @nuwa-ai/payment-kit billing system
 * 
 * This example demonstrates:
 * 1. Setting up a BillingEngine with FileConfigLoader
 * 2. Calculating costs for different billing contexts
 * 3. Using the billing system in a service
 */

import { BillingEngine, FileConfigLoader, BillingContext } from '../src/billing';

async function exampleUsage() {
  // 1. Create a FileConfigLoader pointing to your config directory
  const configLoader = new FileConfigLoader('./config/billing');
  
  // 2. Create a BillingEngine with the config loader
  const billingEngine = new BillingEngine(configLoader);
  
  // 3. Example billing contexts for different operations
  const uploadContext: BillingContext = {
    serviceId: 'example-service',
    operation: 'upload',
    meta: {
      path: '/upload',
      method: 'POST',
      fileSize: 1024000,  // 1MB file
      userId: 'user123'
    }
  };
  
  const downloadContext: BillingContext = {
    serviceId: 'example-service',
    operation: 'download',
    meta: {
      path: '/download',
      method: 'GET',
      fileSize: 2048000,  // 2MB file
      userId: 'user123'
    }
  };
  
  const apiContext: BillingContext = {
    serviceId: 'example-service',
    operation: 'list',
    meta: {
      path: '/api/files',
      method: 'GET',
      userId: 'user123'
    }
  };
  
  try {
    // 4. Calculate costs for each operation
    const uploadCost = await billingEngine.calcCost(uploadContext);
    const downloadCost = await billingEngine.calcCost(downloadContext);
    const apiCost = await billingEngine.calcCost(apiContext);
    
    console.log('Billing Costs:');
    console.log(`Upload cost: ${uploadCost.toString()} (smallest RAV units)`);
    console.log(`Download cost: ${downloadCost.toString()} (smallest RAV units)`);
    console.log(`API call cost: ${apiCost.toString()} (smallest RAV units)`);
    
    // 5. Convert to more readable format (assuming 18 decimal places like ETH)
    const formatCost = (cost: bigint) => {
      const divisor = BigInt(10 ** 18);
      const whole = cost / divisor;
      const fractional = cost % divisor;
      return `${whole}.${fractional.toString().padStart(18, '0')} RAV`;
    };
    
    console.log('\nFormatted costs:');
    console.log(`Upload: ${formatCost(uploadCost)}`);
    console.log(`Download: ${formatCost(downloadCost)}`);
    console.log(`API call: ${formatCost(apiCost)}`);
    
  } catch (error) {
    console.error('Error calculating billing costs:', error);
  }
}

/**
 * Example integration with an Express.js service
 * Note: This requires installing express: npm install express @types/express
 */
// import express from 'express';

function integrateWithExpress() {
  // Uncomment the following code if you have express installed
  /*
  const app = express();
  const configLoader = new FileConfigLoader('./config/billing');
  const billingEngine = new BillingEngine(configLoader);
  
  // Middleware to calculate and log billing costs
  app.use(async (req, res, next) => {
    const context: BillingContext = {
      serviceId: 'web-service',
      operation: req.route?.path || 'unknown',
      meta: {
        path: req.path,
        method: req.method,
        userId: req.headers['user-id'] as string,
        contentLength: req.headers['content-length'] 
          ? parseInt(req.headers['content-length'] as string, 10) 
          : 0
      }
    };
    
    try {
      const cost = await billingEngine.calcCost(context);
      
      // Add cost to request for later use
      (req as any).billingCost = cost;
      
      // Log the billing information
      console.log(`Request ${req.method} ${req.path} - Cost: ${cost.toString()}`);
      
      next();
    } catch (error) {
      console.error('Billing calculation failed:', error);
      // Continue processing even if billing fails
      next();
    }
  });
  
  // Example route handlers
  app.post('/upload', (req, res) => {
    const cost = (req as any).billingCost;
    res.json({ 
      message: 'Upload completed',
      billingCost: cost?.toString() || '0'
    });
  });
  
  app.get('/download/:fileId', (req, res) => {
    const cost = (req as any).billingCost;
    res.json({ 
      message: 'Download initiated',
      fileId: req.params.fileId,
      billingCost: cost?.toString() || '0'
    });
  });
  
  return app;
  */
  
  // Placeholder return for when express is not available
  return null;
}

// Export the examples
export { exampleUsage, integrateWithExpress };

// If running directly, execute the example
if (require.main === module) {
  exampleUsage().catch(console.error);
} 
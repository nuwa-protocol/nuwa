#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { IdentityKit } from '@nuwa-ai/identity-kit';
import { createPaymentChannelHttpClient } from '@nuwa-ai/payment-kit';

/**
 * CLI client demonstrating PaymentChannelHttpClient usage
 * 
 * This example shows how to:
 * 1. Initialize PaymentChannelHttpClient with proper configuration
 * 2. Make HTTP requests with integrated payment functionality
 * 3. Handle different API endpoints with varying pricing models
 */

interface ClientConfig {
  baseUrl: string;
  debug: boolean;
  maxAmount?: bigint;
}

class PaymentCLIClient {
  private client: any;
  private config: ClientConfig;

  constructor(config: ClientConfig) {
    this.config = config;
  }

  async initialize() {
    console.log(chalk.blue('🔑 Initializing Identity Kit...'));
    
    // Initialize IdentityKit from environment
    const kit = await IdentityKit.createFromEnv();
    const signer = kit.getSigner();
    const env = kit.getIdentityEnv();
    
    console.log(chalk.green('✅ Identity Kit initialized'));
    console.log(chalk.cyan(`📝 Payer DID: ${env.custodianDid}`));

    // Create PaymentChannelHttpClient
    this.client = await createPaymentChannelHttpClient({
      baseUrl: this.config.baseUrl,
      signer,
      chainConfig: {
        chain: 'rooch',
        network: env.network as any,
        rpcUrl: env.roochRpcUrl,
        debug: this.config.debug
      },
      maxAmount: this.config.maxAmount,
      debug: this.config.debug
    });

    console.log(chalk.green('💳 Payment client initialized'));
    return this.client;
  }

  async getServiceInfo() {
    try {
      console.log(chalk.blue('🔍 Fetching service info...'));
      const info = await this.client.get('/payment/info');
      
      console.log(chalk.green('📋 Service Information:'));
      console.log(chalk.white(`  Service ID: ${info.serviceId}`));
      console.log(chalk.white(`  Service DID: ${info.serviceDid}`));
      console.log(chalk.white(`  Network: ${info.network}`));
      console.log(chalk.white(`  Default Asset: ${info.defaultAssetId}`));
      console.log(chalk.white(`  Default Price: ${info.defaultPricePicoUSD} picoUSD`));
      
      return info;
    } catch (error) {
      console.error(chalk.red('❌ Failed to get service info:'), error);
      throw error;
    }
  }

  async callEcho(message: string) {
    try {
      console.log(chalk.blue('🔊 Calling echo endpoint...'));
      const result = await this.client.get(`/api/echo?message=${encodeURIComponent(message)}`);
      
      console.log(chalk.green('✅ Echo Response:'));
      console.log(chalk.white(`  Echo: ${result.echo}`));
      console.log(chalk.white(`  Cost: ${result.cost} (${this.formatCost(result.cost)})`));
      console.log(chalk.white(`  Nonce: ${result.nonce}`));
      console.log(chalk.white(`  Timestamp: ${result.timestamp}`));
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Echo request failed:'), error);
      throw error;
    }
  }

  async processText(text: string) {
    try {
      console.log(chalk.blue('⚙️ Calling text processing endpoint...'));
      const result = await this.client.post('/api/process', { text });
      
      console.log(chalk.green('✅ Processing Response:'));
      console.log(chalk.white(`  Input: ${result.input}`));
      console.log(chalk.white(`  Output: ${result.output}`));
      console.log(chalk.white(`  Characters: ${result.characters}`));
      console.log(chalk.white(`  Cost: ${result.cost} (${this.formatCost(result.cost)})`));
      console.log(chalk.white(`  Nonce: ${result.nonce}`));
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Text processing failed:'), error);
      throw error;
    }
  }

  async chatCompletion(messages: Array<{role: string, content: string}>, maxTokens = 100) {
    try {
      console.log(chalk.blue('🤖 Calling chat completion endpoint...'));
      const result = await this.client.post('/api/chat/completions', {
        messages,
        max_tokens: maxTokens
      });
      
      console.log(chalk.green('✅ Chat Completion Response:'));
      console.log(chalk.white(`  Response: ${result.choices[0].message.content}`));
      console.log(chalk.white(`  Tokens Used: ${result.usage.total_tokens} (prompt: ${result.usage.prompt_tokens}, completion: ${result.usage.completion_tokens})`));
      console.log(chalk.white(`  Cost: ${result.cost} (${this.formatCost(result.cost)})`));
      console.log(chalk.white(`  Nonce: ${result.nonce}`));
      
      return result;
    } catch (error) {
      console.error(chalk.red('❌ Chat completion failed:'), error);
      throw error;
    }
  }

  async getChannelInfo() {
    try {
      const channelId = this.client.getChannelId();
      if (!channelId) {
        console.log(chalk.yellow('⚠️ No active channel found'));
        return null;
      }

      console.log(chalk.blue('📊 Channel Information:'));
      console.log(chalk.white(`  Channel ID: ${channelId}`));
      
      const pendingSubRAV = this.client.getPendingSubRAV();
      if (pendingSubRAV) {
        console.log(chalk.white(`  Pending Nonce: ${pendingSubRAV.nonce}`));
        console.log(chalk.white(`  Accumulated Amount: ${pendingSubRAV.accumulatedAmount}`));
      }
      
      return { channelId, pendingSubRAV };
    } catch (error) {
      console.error(chalk.red('❌ Failed to get channel info:'), error);
      throw error;
    }
  }

  private formatCost(costStr: string): string {
    if (!costStr) return 'N/A';
    
    try {
      const cost = BigInt(costStr);
      // Convert from smallest unit to readable format
      // Assuming 6 decimals for gas coin (like RGas)
      const formatted = Number(cost) / 1_000_000;
      return `${formatted.toFixed(6)} RGas`;
    } catch {
      return costStr;
    }
  }
}

async function interactiveMode(client: PaymentCLIClient) {
  console.log(chalk.blue('\n🎯 Interactive Mode - Choose an action:'));
  
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🔍 Get service info', value: 'info' },
        { name: '🔊 Echo message', value: 'echo' },
        { name: '⚙️ Process text', value: 'process' },
        { name: '🤖 Chat completion', value: 'chat' },
        { name: '📊 Channel info', value: 'channel' },
        { name: '🚪 Exit', value: 'exit' }
      ]
    }
  ]);

  switch (action) {
    case 'info':
      await client.getServiceInfo();
      break;
      
    case 'echo':
      const { message } = await inquirer.prompt([
        { type: 'input', name: 'message', message: 'Enter message to echo:', default: 'Hello from CLI!' }
      ]);
      await client.callEcho(message);
      break;
      
    case 'process':
      const { text } = await inquirer.prompt([
        { type: 'input', name: 'text', message: 'Enter text to process:', default: 'hello world' }
      ]);
      await client.processText(text);
      break;
      
    case 'chat':
      const { prompt } = await inquirer.prompt([
        { type: 'input', name: 'prompt', message: 'Enter your message:', default: 'What is the weather like?' }
      ]);
      await client.chatCompletion([{ role: 'user', content: prompt }]);
      break;
      
    case 'channel':
      await client.getChannelInfo();
      break;
      
    case 'exit':
      console.log(chalk.green('👋 Goodbye!'));
      return false;
  }
  
  return true;
}

async function main() {
  const program = new Command();
  
  program
    .name('payment-client')
    .description('CLI client for Payment Kit HTTP integration example')
    .version('1.0.0');

  program
    .option('-u, --url <url>', 'Server base URL', 'http://localhost:3000')
    .option('-d, --debug', 'Enable debug logging', false)
    .option('-m, --max-amount <amount>', 'Maximum payment amount per request', '10000000') // 10 RGas
    .option('-i, --interactive', 'Run in interactive mode', false);

  // Info command
  program
    .command('info')
    .description('Get service information')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getServiceInfo();
    });

  // Echo command
  program
    .command('echo <message>')
    .description('Send echo request')
    .action(async (message, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.callEcho(message);
    });

  // Process command
  program
    .command('process <text>')
    .description('Process text (convert to uppercase)')
    .action(async (text, options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.processText(text);
    });

  // Chat command
  program
    .command('chat <prompt>')
    .description('Send chat completion request')
    .option('-t, --tokens <tokens>', 'Maximum tokens', '100')
    .action(async (prompt, cmdOptions) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.chatCompletion(
        [{ role: 'user', content: prompt }], 
        parseInt(cmdOptions.tokens)
      );
    });

  // Channel command
  program
    .command('channel')
    .description('Show channel information')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      await client.getChannelInfo();
    });

  // Interactive mode
  program
    .command('interactive')
    .alias('i')
    .description('Run in interactive mode')
    .action(async (options) => {
      const config = getConfig(program.opts());
      const client = new PaymentCLIClient(config);
      await client.initialize();
      
      console.log(chalk.green('\n🎉 Welcome to Payment Kit CLI!'));
      console.log(chalk.cyan('This tool demonstrates payment-enabled HTTP requests.'));
      
      let shouldContinue = true;
      while (shouldContinue) {
        try {
          shouldContinue = await interactiveMode(client);
          if (shouldContinue) {
            console.log(); // Add spacing between actions
          }
        } catch (error) {
          console.error(chalk.red('❌ Action failed:'), error);
          const { retry } = await inquirer.prompt([
            { type: 'confirm', name: 'retry', message: 'Would you like to continue?', default: true }
          ]);
          shouldContinue = retry;
        }
      }
    });

  // Parse command line arguments
  const opts = program.opts();
  
  if (opts.interactive || process.argv.length <= 2) {
    // Default to interactive mode if no command specified
    program.parse(['node', 'client-cli.js', 'interactive']);
  } else {
    program.parse();
  }
}

function getConfig(opts: any): ClientConfig {
  return {
    baseUrl: opts.url,
    debug: opts.debug,
    maxAmount: opts.maxAmount ? BigInt(opts.maxAmount) : undefined
  };
}

// Run CLI if executed directly
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('❌ CLI failed:'), error);
    process.exit(1);
  });
}
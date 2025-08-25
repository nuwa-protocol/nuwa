import { BillableRouter, type RouteOptions } from '../express/BillableRouter';
import { McpBillingMiddleware } from '../../middlewares/mcp/McpBillingMiddleware';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { PaymentProcessor } from '../../core/PaymentProcessor';
import { ContractRateProvider } from '../../billing/rate/contract';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import { RoochVDR, VDRRegistry, DebugLogger } from '@nuwa-ai/identity-kit';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import type { RateProvider } from '../../billing';
import type { ChannelRepository } from '../../storage/interfaces/ChannelRepository';
import type { RAVRepository } from '../../storage/interfaces/RAVRepository';
import type { PendingSubRAVRepository } from '../../storage/interfaces/PendingSubRAVRepository';
import { createStorageRepositories } from '../../storage';
import { HubBalanceService } from '../../core/HubBalanceService';
import { ClaimTriggerService } from '../../core/ClaimTriggerService';

export interface McpPaymentKitOptions {
  serviceId: string;
  signer: SignerInterface;
  network?: 'local' | 'dev' | 'test' | 'main';
  rpcUrl?: string;
  defaultAssetId?: string;
  defaultPricePicoUSD?: string | bigint;
  adminDid?: string | string[];
  debug?: boolean;
}

export interface McpPaymentKit {
  register(
    name: string,
    options: RouteOptions,
    handler: (params: any, meta?: any) => Promise<any>,
    ruleId?: string
  ): this;
  getHandlers(): Record<string, (params: any, meta?: any) => Promise<any>>;
}

class McpPaymentKitImpl implements McpPaymentKit {
  private readonly logger = DebugLogger.get('McpPaymentKit');
  private readonly billableRouter: BillableRouter;
  private readonly payeeClient: PaymentChannelPayeeClient;
  private readonly rateProvider: RateProvider;
  private readonly processor: PaymentProcessor;
  private readonly middleware: McpBillingMiddleware;
  private readonly serviceDid: string;
  private readonly handlers = new Map<string, (params: any, meta?: any) => Promise<any>>();

  constructor(
    private readonly config: McpPaymentKitOptions,
    deps: {
      contract: RoochPaymentChannelContract;
      signer: SignerInterface;
      didResolver: DIDResolver;
      rateProvider: RateProvider;
      serviceDid: string;
      storage: { channelRepo: ChannelRepository; ravRepo: RAVRepository; pendingSubRAVRepo: PendingSubRAVRepository };
    }
  ) {
    this.logger.setLevel(config.debug ? 'debug' : 'info');
    this.serviceDid = deps.serviceDid;
    this.billableRouter = new BillableRouter({
      serviceId: config.serviceId,
      defaultPricePicoUSD: config.defaultPricePicoUSD,
    });
    this.rateProvider = deps.rateProvider;

    this.payeeClient = new PaymentChannelPayeeClient({
      contract: deps.contract,
      signer: deps.signer,
      didResolver: deps.didResolver,
      storageOptions: deps.storage,
    });

    const hubBalanceService = new HubBalanceService({
      contract: deps.contract,
      defaultAssetId: config.defaultAssetId || '0x3::gas_coin::RGas',
      debug: config.debug,
    });

    const claimTriggerService = new ClaimTriggerService({
      contract: deps.contract,
      signer: deps.signer,
      ravRepo: deps.storage.ravRepo,
      channelRepo: deps.storage.channelRepo,
      debug: config.debug,
    });

    this.processor = new PaymentProcessor({
      payeeClient: this.payeeClient,
      serviceId: config.serviceId,
      defaultAssetId: config.defaultAssetId,
      rateProvider: deps.rateProvider,
      pendingSubRAVStore: deps.storage.pendingSubRAVRepo,
      ravRepository: deps.storage.ravRepo,
      didResolver: this.payeeClient.getDidResolver(),
      hubBalanceService,
      claimTriggerService,
      minClaimAmount: undefined,
      debug: config.debug,
    });

    this.middleware = new McpBillingMiddleware({ processor: this.processor, ruleProvider: this.billableRouter, debug: config.debug });
  }

  register(
    name: string,
    options: RouteOptions,
    handler: (params: any, meta?: any) => Promise<any>,
    ruleId?: string
  ): this {
    // Reuse Express BillableRouter semantics; store handler mapped by method name
    // Provide a no-op Express handler to satisfy BillableRouter's Express registration
    const noopHandler = (_req: any, _res: any, next: any) => {
      try {
        next?.();
      } catch {}
    };
    this.billableRouter.get(`/mcp/${name}`, options, noopHandler as any, ruleId);
    this.handlers.set(name, async (params: any, meta?: any) => {
      const billing = await this.middleware.preProcess({ method: name, params, meta });
      // If no rule, just run handler
      if (!billing) return await handler(params, meta);

      // Short-circuit for protocol error set in preProcess
      if (billing.state?.error) {
        const settled = this.middleware.settle(billing, 0);
        return this.middleware.attachResponseMeta({ success: false }, settled);
      }

      // Execute business logic
      const result = await handler(params, meta);

      // Determine usage units if provided on meta or result
      const usage = (meta as any)?.usage ?? (result as any)?.usage ?? 0;
      const settled = this.middleware.settle(billing, usage);
      if (settled.state?.unsignedSubRav) {
        await this.middleware.persist(settled);
      }
      return this.middleware.attachResponseMeta(result, settled);
    });
    return this;
  }

  getHandlers(): Record<string, (params: any, meta?: any) => Promise<any>> {
    return Object.fromEntries(this.handlers);
  }
}

export async function createMcpPaymentKit(config: McpPaymentKitOptions): Promise<McpPaymentKit> {
  if (!config.signer) throw new Error('Service private key (signer) is required');

  const serviceDid = await (async () => {
    const maybe = (config.signer as any).getDid?.();
    return typeof maybe?.then === 'function' ? await maybe : maybe;
  })();

  const rpcUrl = config.rpcUrl;
  const network = config.network || 'test';
  const contract = new RoochPaymentChannelContract({ rpcUrl, network, debug: config.debug || false });

  const roochVDR = new RoochVDR({ rpcUrl, network });
  const vdrRegistry = VDRRegistry.getInstance();
  vdrRegistry.registerVDR(roochVDR);

  const rateProvider = new ContractRateProvider(contract, 30_000);

  const storage = createStorageRepositories({ backend: 'memory', tablePrefix: 'nuwa_', autoMigrate: true });

  return new McpPaymentKitImpl(config, {
    contract,
    signer: config.signer,
    didResolver: vdrRegistry,
    rateProvider,
    serviceDid,
    storage,
  });
}



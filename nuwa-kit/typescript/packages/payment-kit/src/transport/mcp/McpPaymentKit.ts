import { BillableRouter } from '../express/BillableRouter';
import type { RouteOptions } from '../express/BillableRouter';
import type { SignerInterface, DIDResolver } from '@nuwa-ai/identity-kit';
import { VDRRegistry, RoochVDR, DIDAuth, DebugLogger } from '@nuwa-ai/identity-kit';
import { RoochPaymentChannelContract } from '../../rooch/RoochPaymentChannelContract';
import type { IPaymentChannelContract } from '../../contracts/IPaymentChannelContract';
import { PaymentChannelPayeeClient } from '../../client/PaymentChannelPayeeClient';
import { ContractRateProvider } from '../../billing/rate/contract';
import type { RateProvider } from '../../billing';
import {
  createStorageRepositories,
  type ChannelRepository,
  type RAVRepository,
  type PendingSubRAVRepository,
} from '../../storage';
import { PaymentProcessor } from '../../core/PaymentProcessor';
import { HubBalanceService } from '../../core/HubBalanceService';
import { ClaimTriggerService, DEFAULT_REACTIVE_CLAIM_POLICY } from '../../core/ClaimTriggerService';
import { McpBillingMiddleware } from '../../middlewares/mcp/McpBillingMiddleware';
import { BuiltInApiHandlers } from '../../api';
import type { ApiContext } from '../../types/api';
import { registerBuiltinStrategies } from '../../billing/strategies';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';
import { validateSerializableResponsePayload } from './ToolSchema';

export interface McpPaymentKitOptions {
  serviceId: string;
  signer: SignerInterface;
  rpcUrl?: string;
  network?: 'local' | 'dev' | 'test' | 'main';
  defaultAssetId?: string;
  defaultPricePicoUSD?: string | bigint;
  adminDid?: string | string[];
  debug?: boolean;
}

export class McpPaymentKit {
  private readonly billableRouter: BillableRouter;
  private readonly middleware: McpBillingMiddleware;
  private readonly logger: DebugLogger;

  constructor(
    private readonly opts: McpPaymentKitOptions,
    private readonly deps: {
      contract: IPaymentChannelContract;
      signer: SignerInterface;
      didResolver: DIDResolver;
      rateProvider: RateProvider;
      serviceDid: string;
      processor: PaymentProcessor;
      payeeClient: PaymentChannelPayeeClient;
      channelRepo: ChannelRepository;
      ravRepo: RAVRepository;
      pendingSubRAVRepo: PendingSubRAVRepository;
    }
  ) {
    // Ensure billing strategies are registered for MCP runtime
    registerBuiltinStrategies();
    this.logger = DebugLogger.get('McpPaymentKit');
    this.logger.setLevel(opts.debug ? 'debug' : 'info');
    this.billableRouter = new BillableRouter({
      serviceId: opts.serviceId,
      defaultPricePicoUSD: opts.defaultPricePicoUSD,
    });
    this.middleware = new McpBillingMiddleware({
      processor: deps.processor,
      ruleProvider: this.billableRouter,
      debug: opts.debug,
    });
  }

  register(
    name: string,
    options: RouteOptions,
    handler: (params: any, meta?: any) => Promise<any>,
    ruleId?: string
  ): this {
    // Register a synthetic HTTP rule for matcher reuse
    const path = `/tool/${name}`;
    (this.billableRouter as any).post(
      path,
      options,
      ((_req: any, _res: any, next: any) => next?.()) as any,
      ruleId
    );
    // Store handler mapping
    (this as any)._handlers = (this as any)._handlers || {};
    (this as any)._handlers[name] = async (params: any, meta?: any) => {
      // Step A: preProcess
      const ctx = await this.middleware.handleWithNewAPI(name, params, meta);
      if (!ctx) return handler(params, meta);
      if (ctx.state?.error) {
        // Prefer using headerValue from preProcess (may include pending SubRAV)
        if ((ctx as any).state?.headerValue) {
          const decoded = HttpPaymentCodec.parseResponseHeader((ctx as any).state.headerValue);
          return {
            data: undefined,
            __nuwa_payment: HttpPaymentCodec.toJSONResponse(decoded),
          } as any;
        }
        // Fallback to minimal structured error (no subRAV)
        const decoded = {
          error: ctx.state.error,
          clientTxRef: ctx.meta.clientTxRef,
          version: 1,
        } as any;
        return { data: undefined, __nuwa_payment: HttpPaymentCodec.toJSONResponse(decoded) } as any;
      }

      // Step B: business handler — pass didInfo via FastMCP context rather than mutating params
      const contextWithDid = ctx?.meta?.didInfo
        ? { ...(meta || {}), didInfo: ctx.meta.didInfo }
        : meta;
      const result = await handler(params, contextWithDid);

      // Step C/D: settle + persist
      const settled = await this.middleware.settle(ctx, result, (result as any)?.__usage);
      // Prefer preProcess header (402) if present and no structured payment in settled
      if ((ctx as any).state?.headerValue && !settled.__nuwa_payment) {
        const decoded = HttpPaymentCodec.parseResponseHeader((ctx as any).state.headerValue);
        const payment = HttpPaymentCodec.toJSONResponse(decoded);
        const issues = validateSerializableResponsePayload(payment);
        if (issues && issues.length) {
          return {
            data: undefined,
            error: {
              code: 'INTERNAL_ERROR',
              message: `Invalid __nuwa_payment: ${issues.join('; ')}`,
            },
          } as any;
        }
        return { data: result, __nuwa_payment: payment } as any;
      }
      // Validate structured payment if exists
      if (settled?.__nuwa_payment) {
        const issues = validateSerializableResponsePayload(settled.__nuwa_payment);
        if (issues && issues.length) {
          return {
            data: undefined,
            error: {
              code: 'INTERNAL_ERROR',
              message: `Invalid __nuwa_payment: ${issues.join('; ')}`,
            },
          } as any;
        }
      }
      return settled;
    };
    return this;
  }

  getHandlers(): Record<string, (params: any, meta?: any) => Promise<any>> {
    return { ...((this as any)._handlers || {}) };
  }

  /** Register built-in Nuwa handlers as MCP tools with billing options */
  registerBuiltIns(): this {
    const ctx: ApiContext = {
      config: {
        serviceId: this.opts.serviceId,
        serviceDid: this.getServiceDid(),
        defaultAssetId: this.opts.defaultAssetId || '0x3::gas_coin::RGas',
        defaultPricePicoUSD: this.opts.defaultPricePicoUSD?.toString(),
        adminDid: this.opts.adminDid,
        debug: this.opts.debug,
      },
      payeeClient: this.getPayeeClient(),
      rateProvider: this.getRateProvider(),
      claimTriggerService: undefined,
      processor: this.getProcessor(),
      ravRepository: this.getRepositories().ravRepo,
      channelRepo: this.getRepositories().channelRepo,
      pendingSubRAVStore: this.getRepositories().pendingSubRAVRepo,
    } as ApiContext;

    const mapName = (key: string): string => {
      switch (key) {
        case 'health':
          return 'nuwa.health';
        case 'discovery':
          return 'nuwa.discovery';
        case 'recovery':
          return 'nuwa.recovery';
        case 'commit':
          return 'nuwa.commit';
        case 'adminStatus':
          return 'nuwa.admin.status';
        case 'adminClaimTrigger':
          return 'nuwa.admin.claimTrigger';
        case 'subravQuery':
          return 'nuwa.subrav.query';
        default:
          return `nuwa.${key}`;
      }
    };

    for (const [key, cfg] of Object.entries(BuiltInApiHandlers)) {
      const methodName = mapName(key);
      const handler = async (params: any, context?: any) => {
        // Built-in handlers expect DID info on the request object; enrich from FastMCP context
        const req = context?.didInfo ? { ...params, didInfo: context.didInfo } : params;
        const res = await cfg.handler(ctx as any, req);
        if (methodName === 'nuwa.health') {
          // Return flat object expected by tests
          return {
            status: (res as any)?.status ?? 'healthy',
            service: this.getServiceDid(),
          } as any;
        }
        // Return plain data; billing settlement wrapper will embed __nuwa_payment
        return res;
      };
      this.register(methodName, cfg.options, handler, key);
    }

    // Add MCP discovery tool (FREE). Express variant lives at well-known path, so we add here for MCP
    this.register(
      'nuwa.discovery',
      { pricing: '0', authRequired: false } as any,
      async () => {
        return {
          serviceId: this.opts.serviceId,
          serviceDid: this.getServiceDid(),
          defaultAssetId: this.opts.defaultAssetId || '0x3::gas_coin::RGas',
        } as any;
      },
      'discovery'
    );

    return this;
  }

  getPayeeClient(): PaymentChannelPayeeClient {
    return this.deps.payeeClient;
  }

  getRateProvider(): RateProvider {
    return this.deps.rateProvider;
  }

  getProcessor(): PaymentProcessor {
    return this.deps.processor;
  }

  getServiceDid(): string {
    return this.deps.serviceDid;
  }

  getRepositories() {
    return {
      channelRepo: this.deps.channelRepo,
      ravRepo: this.deps.ravRepo,
      pendingSubRAVRepo: this.deps.pendingSubRAVRepo,
    };
  }

  private toStructured(decoded: any) {
    return {
      version: decoded.version,
      clientTxRef: decoded.clientTxRef,
      serviceTxRef: decoded.serviceTxRef,
      subRav: decoded.subRav
        ? ((HttpPaymentCodec as any).serializeSubRAV?.(decoded.subRav) ?? decoded.subRav)
        : undefined,
      cost: decoded.cost !== undefined ? decoded.cost.toString() : undefined,
      costUsd: decoded.costUsd !== undefined ? decoded.costUsd.toString() : undefined,
      error: decoded.error,
    };
  }
}

export async function createMcpPaymentKit(config: McpPaymentKitOptions) {
  const serviceDid = await (async () => {
    const maybe = (config.signer as any).getDid?.();
    return typeof maybe?.then === 'function' ? await maybe : maybe;
  })();

  const rpcUrl = config.rpcUrl;
  const network = config.network || 'test';
  const contract = new RoochPaymentChannelContract({
    rpcUrl,
    network,
    debug: config.debug || false,
  });
  const roochVDR = new RoochVDR({ rpcUrl, network });
  const vdrRegistry = VDRRegistry.getInstance();
  vdrRegistry.registerVDR(roochVDR);
  const rateProvider = new ContractRateProvider(contract, 30_000);

  // Storage (memory by default)
  const { channelRepo, ravRepo, pendingSubRAVRepo } = createStorageRepositories({
    backend: 'memory',
    tablePrefix: 'nuwa_',
    autoMigrate: true,
  });

  const payeeClient = new PaymentChannelPayeeClient({
    contract,
    signer: config.signer,
    didResolver: vdrRegistry,
    storageOptions: { channelRepo, ravRepo, pendingSubRAVRepo },
  });

  const hubBalanceService = new HubBalanceService({
    contract,
    defaultAssetId: config.defaultAssetId || '0x3::gas_coin::RGas',
  });
  const claimTriggerService = new ClaimTriggerService({
    policy: {},
    contract,
    signer: config.signer,
    ravRepo,
    channelRepo,
  });

  const processor = new PaymentProcessor({
    payeeClient,
    serviceId: config.serviceId,
    defaultAssetId: config.defaultAssetId,
    rateProvider,
    pendingSubRAVStore: pendingSubRAVRepo,
    ravRepository: ravRepo,
    didResolver: vdrRegistry,
    hubBalanceService,
    claimTriggerService,
    minClaimAmount: DEFAULT_REACTIVE_CLAIM_POLICY.minClaimAmount,
    debug: config.debug,
  });

  return new McpPaymentKit(config, {
    contract,
    signer: config.signer,
    didResolver: vdrRegistry,
    rateProvider,
    serviceDid,
    processor,
    payeeClient,
    channelRepo,
    ravRepo,
    pendingSubRAVRepo,
  }).registerBuiltIns();
}

import { BillableRouter } from '../express/BillableRouter';
import type { RouteOptions } from '../express/BillableRouter';
import type { SignerInterface, DIDResolver, IdentityEnv } from '@nuwa-ai/identity-kit';
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
import { ErrorCode, type ApiContext } from '../../types/api';
import { registerBuiltinStrategies } from '../../billing/strategies';
import { HttpPaymentCodec } from '../../middlewares/http/HttpPaymentCodec';
import { serializeJson } from '../../utils/json';
import { PaymentKitError } from '../../errors/PaymentKitError';
import { getChainConfigFromEnv } from '../../helpers/fromIdentityEnv';

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
  private readonly handlers: Map<
    string,
    {
      handler: (params: any, context?: any) => Promise<any>;
      options: RouteOptions;
      ruleId?: string;
    }
  >;

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
    this.handlers = new Map();
  }

  register(
    name: string,
    options: RouteOptions,
    handler: (params: any, context?: any) => Promise<any>,
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
    this.handlers.set(name, { handler, options, ruleId });
    return this;
  }

  async invoke(name: string, params: any, context?: any): Promise<any> {
    const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const entry = this.handlers.get(name);
    if (!entry) {
      return {
        error: {
          code: 'METHOD_NOT_FOUND',
          message: `Tool '${name}' not found`,
        },
      } as any;
    }

    // Step A: preProcess (billable or other tools)
    const contextWithRid = { ...(context || {}), requestId: rid } as any;
    const ctx = await this.middleware.handleWithNewAPI(name, params, contextWithRid);
    if (!ctx) {
      const result = await entry.handler(params, context);
      const content: any[] = [];
      if (result && typeof result === 'object' && Array.isArray((result as any).content)) {
        content.push(...(result as any).content);
      } else if (result !== undefined) {
        content.push({ type: 'text', text: serializeJson(result) });
      }

      return { content } as any;
    }
    if (ctx.state?.error) {
      // Prefer structured response payload populated in preProcess (includes pending subRav)
      if (ctx.state.responsePayload) {
        const payment = HttpPaymentCodec.toJSONResponse(ctx.state.responsePayload);
        const content: any[] = [HttpPaymentCodec.buildMcpPaymentResource(payment as any)];
        return { content } as any;
      }
      // No header fallback in MCP path
      // Final fallback to minimal structured error (no subRAV)
      const decoded = {
        error: ctx.state.error,
        clientTxRef: ctx.meta.clientTxRef,
        version: 1,
      } as any;
      const paymentOnly = HttpPaymentCodec.toJSONResponse(decoded);
      return { content: [HttpPaymentCodec.buildMcpPaymentResource(paymentOnly as any)] } as any;
    }

    // Step B: business handler — pass didInfo via FastMCP context rather than mutating params
    const contextWithDid = ctx?.meta?.didInfo
      ? { ...(context || {}), didInfo: ctx.meta.didInfo }
      : context;
    const result = await entry.handler(params, contextWithDid);

    // Step C/D: settle + persist
    // If middleware flagged to skip billing (e.g., nuwa.recovery), return plain result
    if ((ctx as any).__skipBilling) {
      const content: any[] = [];
      if (result && typeof result === 'object' && Array.isArray((result as any).content)) {
        content.push(...(result as any).content);
      } else if (result !== undefined) {
        content.push({ type: 'text', text: serializeJson(result) });
      }

      return { content } as any;
    }
    const settled = await this.middleware.settle(ctx, result, (result as any)?.__usage);

    // Build MCP content array, separating payment info as a dedicated resource item
    const content: any[] = [];
    const dataPayload = settled?.data ?? result;
    if (
      dataPayload &&
      typeof dataPayload === 'object' &&
      Array.isArray((dataPayload as any).content)
    ) {
      content.push(...(dataPayload as any).content);
    } else if (dataPayload !== undefined) {
      content.push({ type: 'text', text: serializeJson(dataPayload) });
    }
    if ((settled as any)?.__nuwa_payment) {
      content.push(
        HttpPaymentCodec.buildMcpPaymentResource((settled as any).__nuwa_payment as any)
      );
    }
    this.logger.debug('MCP invoke end', { rid, name } as any);
    return { content } as any;
  }

  listTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  // getHandlers removed in favor of listTools() + invoke()

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
      const routeOptions = cfg.options;
      const handler = async (params: any, context?: any) => {
        // Built-in handlers expect DID info on the request object; enrich from FastMCP context
        const req = context?.didInfo ? { ...params, didInfo: context.didInfo } : params;
        const res = await cfg.handler(ctx as any, req);
        // If handler follows ApiResponse envelope, normalize:
        if (res && typeof res === 'object' && 'success' in (res as any)) {
          const ok = Boolean((res as any).success);
          if (!ok) {
            const e = (res as any).error;
            // Throw error → FastMCP 将按 JSON-RPC error 返回
            throw new PaymentKitError(
              e?.code || 'INTERNAL_ERROR',
              e?.message || 'Error',
              e?.httpStatus || 500,
              e?.details
            );
          }
          return (res as any).data;
        } else {
          this.logger.error('Unexpect api response:', res);
          throw new PaymentKitError(ErrorCode.INTERNAL_ERROR, 'Unexpect api response');
        }
      };
      this.register(methodName, routeOptions, handler, key);
    }

    // Add MCP discovery tool (FREE). Express variant lives at well-known path, so we add here for MCP
    this.register(
      'nuwa.discovery',
      { pricing: '0', authRequired: false } as any,
      async () => {
        this.logger.debug('MCP built-in nuwa.discovery executed');
        return {
          serviceId: this.opts.serviceId,
          serviceDid: this.getServiceDid(),
          defaultAssetId: this.opts.defaultAssetId || '0x3::gas_coin::RGas',
        } as any;
      },
      'discovery'
    );

    this.logger.debug('MCP built-in tools registered', {
      tools: this.listTools(),
      total: this.listTools().length,
    } as any);

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

/**
 * Convenience: create McpPaymentKit from IdentityEnv (uses env.keyManager as signer and chain config from VDR)
 */
export async function createMcpPaymentKitFromEnv(
  env: IdentityEnv,
  cfg: Omit<McpPaymentKitOptions, 'signer' | 'rpcUrl' | 'network'>
) {
  const chain = getChainConfigFromEnv(env);
  return createMcpPaymentKit({
    ...cfg,
    signer: env.keyManager,
    rpcUrl: chain.rpcUrl,
    network: chain.network,
    debug: cfg.debug ?? chain.debug,
  });
}

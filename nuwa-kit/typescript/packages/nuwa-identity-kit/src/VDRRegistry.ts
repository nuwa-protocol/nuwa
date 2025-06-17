import {
  DIDDocument,
  VDRInterface,
  DIDCreationRequest,
  CADOPCreationRequest,
  DIDCreationResult,
} from './types';

/**
 * Global registry for VDR (Verifiable Data Registry) implementations
 */
export class VDRRegistry {
  private static instance: VDRRegistry;
  private vdrs: Map<string, VDRInterface> = new Map();

  private constructor() {}

  static getInstance(): VDRRegistry {
    if (!this.instance) {
      this.instance = new VDRRegistry();
    }
    return this.instance;
  }

  registerVDR(vdr: VDRInterface) {
    this.vdrs.set(vdr.getMethod(), vdr);
  }

  getVDR(method: string): VDRInterface | undefined {
    return this.vdrs.get(method);
  }

  async resolveDID(did: string): Promise<DIDDocument | null> {
    const method = did.split(':')[1];
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    return vdr.resolve(did);
  }

  async createDID(
    method: string,
    creationRequest: DIDCreationRequest,
    options?: Record<string, any>
  ): Promise<DIDCreationResult> {
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    return vdr.create(creationRequest);
  }

  async createDIDViaCADOP(
    method: string,
    creationRequest: CADOPCreationRequest,
    options?: Record<string, any>
  ): Promise<DIDCreationResult> {
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    return vdr.createViaCADOP(creationRequest, options);
  }

  async exists(did: string): Promise<boolean> {
    const method = did.split(':')[1];
    const vdr = this.vdrs.get(method);
    if (!vdr) {
      throw new Error(`No VDR available for method: ${method}`);
    }
    return vdr.exists(did);
  }
}

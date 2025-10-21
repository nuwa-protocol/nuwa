import { Cap, CapKit } from "../src/index";
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { setupEnv } from "./setup";
import { IdentityEnv } from "@nuwa-ai/identity-kit";

describe("CapKit", () => {
  let capKit: CapKit;
  let identityEnv: IdentityEnv;
  beforeAll(async () => {
    const { capKit: a, identityEnv: s } = await setupEnv();
    capKit = a;
    identityEnv = s;
  }, 60000)
  
  afterAll(async () => {
    await capKit?.mcpClose()
  })

  const buildCap = (did:string, name: string, disName?: string)=> {
    return {
      id: `${did}:test_cap`,
      idName: name,
      authorDID: did,
      core: {
        mcpServers: {},
        prompt: {
          suggestions: ['hello', name],
          value: 'nuwa test cap'
        },
        model: {
          providerId: "anthropic",
          modelId: 'openai/gpt-4o-mini',
          supportedInputs: ['text', 'image', 'file'],
          modelType: 'Language Model',
          contextLength: 100,
        }
      },
      metadata: {
        displayName: disName ?? "nuwa_test",
        description: "nuwa test cap nuwa test cap nuwa test cap",
        introduction: "nuwa test",
        tags: [
          "Coding"
        ],
        thumbnail: "https://nuwa.dev/_next/image?url=%2Flogos%2Fbasic-logo_brandcolor.png&w=256&q=75"
      }
    } as Cap
  }

  it("should register a cap", async () => {
    const did = await identityEnv.keyManager.getDid();
    
    const result = await capKit.registerCap(buildCap(did, 'test_cap123'));
    expect(result).toBeDefined();
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    const download1 = await capKit.downloadByCID(result || '');
    expect(download1).toBeDefined();

    const result2 = await capKit.registerCap(buildCap(did, 'test_cap123', 'update_test'));
    expect(result2).toBeDefined();

    await new Promise(resolve => setTimeout(resolve, 10000));
    const download2 = await capKit.downloadByCID(result2 || '');
    expect(download2).toBeDefined();

    const result3 = await capKit.queryByName('test_cap');
    expect(result3.code).toBe(200);

  }, 1000000); // 30 second timeout for blockchain operations
});

import { CapKitMcp, CapKitRestful } from "../../src";
import { setupEnv } from "../env";
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

describe("CapKit", () => {
  let capKitRestful: CapKitRestful;
  let capKitMcp: CapKitMcp;
  beforeAll(async () => {
    capKitRestful = new CapKitRestful('http://localhost:3000/api');
  })

  afterAll(async () => {
    await capKitMcp?.mcpClose()
  })

  it("query caps", async () => {
    const result = await capKitRestful.queryCaps(undefined, ['Tools'], 1,2, 'downloads', 'asc')
    expect(result).toBeDefined()
    expect(result.code).toEqual(200)
  });

  it("query user installed caps", async () => {
    const { capKit, identityEnv } = await setupEnv();
    capKitMcp = capKit;
    const did = await identityEnv.keyManager.getDid();

    const caps = await capKitRestful.queryCaps()

    const id = caps.data?.items[0].id
    const result = await capKitMcp.install(id || '', 'add')

    const result1 = await capKitRestful.queryUserInstalledCaps(did)
    expect(result1).toBeDefined()
  }, 150000)

  it("query cap", async () => {
    const caps = await capKitRestful.queryCaps()
    const id = caps.data?.items[0].id
    const cap = await capKitRestful.queryCap(id || '')
    expect(cap).toBeDefined()
  })

  it("download cap", async () => {
    const caps = await capKitRestful.queryCaps("test_cap123");
    const id = caps.data?.items[0].id
    const result = await capKitRestful.downloadCap(id || '')
    expect(result).toBeDefined()
  })

  it("download caps", async () => {
    const caps = await capKitRestful.queryCaps("test_cap123")
    const result = await capKitRestful.downloadCaps(caps.data!.items.map((cap: any) => cap.id))
    expect(result).toBeDefined()
  })
});

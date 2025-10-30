import { CapKitMcp } from "../src/index.js";
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import {setupEnv} from "./env";

describe("CapKit", () => {
  let capKit: CapKitMcp;
  beforeAll(async () => {
    const { capKit: a } = await setupEnv();
    capKit = a;
  })
  
  afterAll(async () => {
    await capKit?.mcpClose()
  })

  it("download cap by id", async () => {
    const caps = await capKit.queryByName("test_cap123")

    const result = await capKit.downloadByID(
      caps.data?.items[0].id || ''
    )

    expect(result).toBeDefined();
  }, 150000);
});

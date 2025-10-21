import { CapKit } from "../src/index";
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import {setupEnv} from "./setup";

describe("CapKit", () => {
  let capKit: CapKit;
  beforeAll(async () => {
    const { capKit: a } = await setupEnv();
    capKit = a;
  })
  
  afterAll(async () => {
    await capKit?.mcpClose()
  })

  it("download cap by id", async () => {
    const caps = await capKit.queryByName()

    const result = await capKit.downloadByCID(
      caps.data?.items[0].cid || ''
    )

    const result1 = await capKit.downloadByID(
      caps.data?.items[0].id || ''
    )

    expect(result).toBeDefined();
    expect(result1).toBeDefined();
  }, 150000);
});

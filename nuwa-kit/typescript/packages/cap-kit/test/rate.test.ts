import { CapKit } from "../src/index";
import {describe, expect, it} from '@jest/globals';
import {setupEnv} from "./setup";

describe("CapKit", () => {
  let capKit: CapKit;
  beforeAll(async () => {
    const { capKit: a } = await setupEnv();
    capKit = a;
  })

  it("should rate a cap", async () => {
    const all = await capKit.queryByName('test')
    expect(all.code).toBe(200);

    const result = await capKit.rateCap(all.data?.items[0].id || '', 1)

    expect(result.code).toBe(200);

  }, 150000);
});

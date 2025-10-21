import { CapKit } from "../src/index";
import {describe, expect, it, beforeAll, afterAll} from '@jest/globals';
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

  it("should query cap rating distribution", async () => {
    const all = await capKit.queryByName(undefined, {
      sortBy: 'downloads'
    })

    const cap = all.data?.items[0]
    const result = await capKit.favorite(cap?.id || '', 'add')
    expect(result.code).toBe(200);
    const isFavorite = await capKit.favorite(cap?.id || '', 'isFavorite')
    expect(isFavorite.code).toBe(200);
    expect(isFavorite.data).toEqual(true)

    const ratingDistribution = await capKit.queryCapRatingDistribution(cap?.id || '') 
    expect(ratingDistribution.code).toBe(200);
    expect(ratingDistribution.data?.length).toEqual(5);
  }, 1500000);
});

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

  it("should favorite a cap", async () => {
    const all = await capKit.queryByName('test')

    const cap = all.data?.items[0]
    const result = await capKit.favorite(cap?.id || '', 'add')
    expect(result.code).toBe(200);
    const isFavorite = await capKit.favorite(cap?.id || '', 'isFavorite')
    expect(isFavorite.code).toBe(200);
    expect(isFavorite.data).toEqual(true)

    const fav = await capKit.queryMyFavorite()
    expect(fav.code).toBe(200);
    expect(fav.data?.items.length).toEqual(1)

    const result1 = await capKit.favorite(cap?.id || '', 'remove')
    expect(result1.code).toBe(200);
    const isFavorite1 = await capKit.favorite(cap?.id || '', 'isFavorite')
    expect(isFavorite1.code).toBe(200);
    expect(isFavorite1.data).toEqual(false)

    const fav1 = await capKit.queryMyFavorite()
    expect(fav1.code).toBe(200);
    expect(fav1.data?.items.length).toEqual(0)
  }, 1500000);
});

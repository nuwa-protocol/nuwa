import { CapKit } from "../src/index";
import {describe, expect, it} from '@jest/globals';
import {setupEnv} from "./setup";

describe("CapKit query cap", () => {
  let capKit: CapKit;
  beforeAll(async () => {
    const { capKit: a } = await setupEnv();
    capKit = a;
  })

  it("should query cap by name", async () => {

    const resut1 = await capKit.queryByName(undefined, {
      tags: ['AI Model'],
      page: 0,
      size: 45,
      sortBy: 'downloads',
      sortOrder: 'desc',
    })

    const all = await capKit.queryByName(undefined, {
      sortBy: 'downloads',
      sortOrder: "desc"
    })

    const result = await capKit.queryByName('test')



    const result2 = await capKit.queryByName(undefined, {
      tags: ['Coding'],
      sortBy: 'average_rating',
      sortOrder: 'asc'
    })

    expect(all.code).toBe(200);
    expect(result.code).toBe(200);
    expect(resut1.code).toBe(200);
    expect(result2.code).toBe(200);

  }, 150000);

  it("should query cap by id", async () => {
    const all = await capKit.queryByName()

    const cap = all.data?.items[0]
    const result = await capKit.queryByID({cid: cap?.cid})
    expect(result.code).toBe(200);

    const result1 = await capKit.queryByID({id: cap?.id})
    expect(result1.code).toBe(200);
  }, 150000);

  it("should query my favorite caps", async () => {
    const all = await capKit.queryMyFavorite()

    expect(all.code).toBe(200);

  }, 150000);

  it("should query cap stats", async () => {
    const all = await capKit.queryByName()

    const cap = all.data?.items[0]

    const stats = await capKit.queryCapStats(cap?.id || '')

    expect(stats.code).toBe(200);

  }, 150000);
});

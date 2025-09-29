import {CapKit, ResultCap} from "../src/index";
import {afterAll, describe, expect, it} from '@jest/globals';
import {setupEnv} from "./setup";

describe("CapKit query cap", () => {
  let capKit: CapKit;
  beforeAll(async () => {
    const { capKit: a } = await setupEnv();
    capKit = a;
  })
  afterAll(async () => {
    await capKit.mcpClose()
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

  it("should query cap page", async () => {

    const all: ResultCap[] = []
    const pageSize = 50
    let page= 0
    let totalItems = 0
    const pageData: Map<number, ResultCap[]> = new Map()

    const fetch = async () => {
      const result = await capKit.queryByName(undefined, {
        page,
        size: pageSize
      })
      if (result.data?.items) {
        all.push(...result.data.items)
        pageData.set(page, result.data.items)
      }

      page = page + 1
      totalItems = result.data?.totalItems || 0
      if (all.length !== totalItems) {
        await fetch()
      }
    }

    await fetch()

    const checkAll: Map<string, ResultCap> = new Map()


    all.forEach((item) => {
      checkAll.set(item.id, item)
    })

    console.log('=== Data Difference Analysis ===');
    console.log(`all.length: ${all.length}`);
    console.log(`checkAll.size: ${checkAll.size}`);
    
    const allIds = all.map(item => item.id);
    const uniqueIds = new Set(allIds);
    console.log(`Number of unique IDs in all: ${uniqueIds.size}`);
    console.log(`Are there duplicate IDs in all: ${allIds.length !== uniqueIds.size}`);
    
    if (allIds.length !== uniqueIds.size) {
      const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
      console.log(`Duplicate IDs: ${[...new Set(duplicateIds)]}`);
    }
    
    const allInCheckAll = all.every(item => checkAll.has(item.id));
    const checkAllInAll = Array.from(checkAll.values()).every(item => 
      all.some(allItem => allItem.id === item.id)
    );
    
    console.log(`All items in all are in checkAll: ${allInCheckAll}`);
    console.log(`All items in checkAll are in all: ${checkAllInAll}`);
    
    let contentMismatch = false;
    for (const item of all) {
      const checkAllItem = checkAll.get(item.id);
      if (checkAllItem && JSON.stringify(item) !== JSON.stringify(checkAllItem)) {
        contentMismatch = true;
        console.log(`Data content inconsistent for ID ${item.id}`);
        break;
      }
    }
    console.log(`Is data content completely consistent: ${!contentMismatch}`);

    console.log('=== Summary ===');
    if (all.length === checkAll.size && allInCheckAll && checkAllInAll && !contentMismatch) {
      console.log('✅ all and checkAll data are completely consistent, only data structure differs');
      console.log('- all: Array<ResultCap> - Maintains original order, allows duplicates');
      console.log('- checkAll: Map<string, ResultCap> - Uses ID as key, automatically deduplicates');
    } else {
      console.log('❌ all and checkAll have data differences');
    }

    // expect(checkAll.size).toEqual(all.length);

  }, 150000);
});

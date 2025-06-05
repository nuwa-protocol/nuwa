import { BaseRepository, BaseRecord } from '../base.js';

interface TestRecord extends BaseRecord {
  name: string;
  value: string;
}

class TestRepository extends BaseRepository<TestRecord> {
  constructor() {
    super('test_table');
  }

  protected mapToRecord(data: any): TestRecord {
    return {
      id: data.id,
      name: data.name,
      value: data.value,
      created_at: this.deserializeDate(data.created_at),
      updated_at: this.deserializeDate(data.updated_at)
    };
  }
}

describe('BaseRepository', () => {
  let repo: TestRepository;

  beforeAll(() => {
    repo = new TestRepository();
  });

  it('should properly serialize and deserialize dates', () => {
    const date = new Date();
    const serialized = repo['serializeDate'](date);
    const deserialized = repo['deserializeDate'](serialized);
    
    expect(deserialized.getTime()).toBe(date.getTime());
  });

  it('should handle null dates', () => {
    const deserialized = repo['deserializeDate'](null);
    expect(deserialized).toBeInstanceOf(Date);
  });
}); 
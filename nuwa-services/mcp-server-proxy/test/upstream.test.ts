import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { initUpstream, forwardToolList, forwardPromptList, forwardPromptGet, forwardResourceList, forwardResourceTemplateList, forwardResourceRead } from '../src/upstream.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Upstream (stdio) integration', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const script = path.resolve(__dirname, 'fixtures/stdio-mock-mcp.js');

  let upstream: any;

  beforeAll(async () => {
    upstream = await initUpstream('mock', {
      type: 'stdio',
      command: ['node', script],
      cwd: process.cwd(),
    } as any);
  }, 10000);

  afterAll(async () => {
    await upstream.client.close();
  });

  // Mock FastifyReply
  class MockReply {
    statusCode = 200;
    payload: any = undefined;
    status(code: number) { this.statusCode = code; return this; }
    send(payload: any) { this.payload = payload; return this; }
  }

  it('forwardToolList returns echo tool', async () => {
    const reply = new MockReply();
    const mockReq = { body: {}, headers: {}, query: {}, params: {}, raw: {}, id: 'test', ctx: { upstream: 'mock', startTime: Date.now() } };
    await forwardToolList(mockReq as any, reply as any, upstream);
    expect(reply.payload.tools[0].name).toBe('echo');
  });

  it('forwardPromptList returns hello prompt', async () => {
    const reply = new MockReply();
    const mockReq = { body: {}, headers: {}, query: {}, params: {}, raw: {}, id: 'test', ctx: { upstream: 'mock', startTime: Date.now() } };
    await forwardPromptList(mockReq as any, reply as any, upstream);
    expect(reply.payload.prompts[0].name).toBe('hello');
  });

  it('forwardPromptGet returns prompt message', async () => {
    const reply = new MockReply();
    const mockReq = { body: {}, headers: {}, query: {}, params: {}, raw: {}, id: 'test', ctx: { upstream: 'mock', startTime: Date.now() } };
    const req = { ...mockReq, body: { name: 'hello' } };
    await forwardPromptGet(req as any, reply as any, upstream);
    expect(reply.payload.messages[0].content.text).toBe('Hello, world!');
  });

  it('forwardResourceList returns test.txt resource', async () => {
    const reply = new MockReply();
    const mockReq = { body: {}, headers: {}, query: {}, params: {}, raw: {}, id: 'test', ctx: { upstream: 'mock', startTime: Date.now() } };
    await forwardResourceList(mockReq as any, reply as any, upstream);
    expect(reply.payload.resources[0].name).toBe('test.txt');
    console.log('reply.payload', reply.payload);
  });

  it('forwardResourceTemplateList returns template1', async () => {
    const reply = new MockReply();
    const mockReq = { body: {}, headers: {}, query: {}, params: {}, raw: {}, id: 'test', ctx: { upstream: 'mock', startTime: Date.now() } };
    await forwardResourceTemplateList(mockReq as any, reply as any, upstream);
    expect(reply.payload.resourceTemplates[0].name).toBe('template1');
  });

  it('forwardResourceRead returns file content', async () => {
    const reply = new MockReply();
    const mockReq = { body: {}, headers: {}, query: {}, params: {}, raw: {}, id: 'test', ctx: { upstream: 'mock', startTime: Date.now() } };
    const req = { ...mockReq, body: { params: { uri: 'file:///test.txt' } } };
    await forwardResourceRead(req as any, reply as any, upstream);
    console.log('reply.payload', reply.payload);
    expect(reply.payload.contents[0].text).toBe('file content');
  });
}); 
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/api.js';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
test('request uses same-origin API and forwards real JSON payloads', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/simulate');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, '{"weights":{}}');
    return Response.json({ value: 12345.67 });
  };
  assert.deepEqual(await request('simulate', { method: 'POST', body: '{"weights":{}}' }), { value: 12345.67 });
});
test('backend validation and proxy failures remain actionable errors', async () => {
  globalThis.fetch = async () => Response.json({ detail: [{ msg: 'Weights must sum to 1' }] }, { status: 422 });
  await assert.rejects(request('simulate'), /Weights must sum to 1/);
  globalThis.fetch = async () => new Response('Bad gateway', { status: 502 });
  await assert.rejects(request('portfolio'), /502/);
  globalThis.fetch = async () => new Response('<html>SPA fallback</html>');
  await assert.rejects(request('portfolio'), /API proxy/);
});
test('network failure never produces fabricated portfolio results', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(request('portfolio'), /Cannot reach the backend/);
});
test('unmounted requests preserve cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_, { signal }) => { signal.throwIfAborted(); };
  await assert.rejects(request('portfolio', { signal: controller.signal }), { name: 'AbortError' });
});
test('slow backend requests time out with a retry message', async () => {
  globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(request('training/jobs', { timeoutMs: 10 }), /too long.*retry/);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('provider diagnostics remain actionable in the GUI error without fabricated data', async () => {
  globalThis.fetch = async () => Response.json({
    detail: 'Historical market data unavailable: yahoo[proxy_denied] SPY. Request ID: test-request. No synthetic fallback was used.',
    diagnostics: { request_id: 'test-request', failures: [{ provider: 'yahoo', code: 'proxy_denied', symbol: 'SPY' }] },
  }, { status: 503 });
  await assert.rejects(request('market?data_source=real'), error =>
    error.status === 503 && error.message.includes('proxy_denied') && error.message.includes('test-request'));
});

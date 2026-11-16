import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApiUrl } from '../src/lib/apiUrl.js';
test('JSON and export paths retain the local proxy default', () => {
  assert.equal(makeApiUrl('portfolio'), '/api/portfolio');
  assert.equal(makeApiUrl('backtests/id/export?format=csv'), '/api/backtests/id/export?format=csv');
});
test('HTTPS backend origin is applied to JSON and exports', () => {
  assert.equal(makeApiUrl('portfolio', 'https://api.example.com/'), 'https://api.example.com/api/portfolio');
  assert.equal(makeApiUrl('backtests/id/export?format=csv', 'https://api.example.com'), 'https://api.example.com/api/backtests/id/export?format=csv');
});

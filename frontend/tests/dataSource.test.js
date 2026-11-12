import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artifactSource, compatibleExperiment, marketPath, sourceName } from '../src/lib/dataSource.js';
test('legacy artifacts are synthetic and cannot be presented as real-data models', () => {
  const legacy = { config: { seed: 7 }, data: { sha256: 'old' } };
  assert.equal(artifactSource(legacy), 'synthetic');
  assert.equal(compatibleExperiment(legacy, 'real', '3Y'), false);
  assert.equal(compatibleExperiment(legacy, 'synthetic', '3Y'), true);
});
test('real model comparison requires matching source and requested historical range', () => {
  const model = { data: { data_source: 'real', data_range: '3Y' } };
  assert(compatibleExperiment(model, 'real', '3Y'));
  assert(!compatibleExperiment(model, 'synthetic', '3Y'));
  assert(!compatibleExperiment(model, 'real', '1Y'));
});
test('market selection and manual refresh are explicit API arguments', () => {
  const query = new URLSearchParams(marketPath('real', '5Y', 0.04, true).split('?')[1]);
  assert.equal(query.get('data_source'), 'real');
  assert.equal(query.get('data_range'), '5Y');
  assert.equal(query.get('cash_annual_return'), '0.04');
  assert.equal(query.get('refresh'), 'true');
  assert.equal(sourceName('real'), 'Real Historical Market Data');
});

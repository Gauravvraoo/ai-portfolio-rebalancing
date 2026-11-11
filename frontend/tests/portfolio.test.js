import test from "node:test";
import assert from "node:assert/strict";
import { monthlySharpe, recentTrades } from "../src/lib/portfolio.js";
test("monthly Sharpe uses sample deviation and monthly annualization", () => {
  const actual = monthlySharpe([
    { value: 100 },
    { value: 110 },
    { value: 99 },
    { value: 118.8 },
  ]);
  const returns = [0.1, -0.1, 0.2],
    mean = 1 / 15;
  const variance =
    returns.map((r) => (r - mean) ** 2).reduce((a, b) => a + b) / 2;
  assert(
    Math.abs(actual - (mean / Math.sqrt(variance)) * Math.sqrt(12)) < 1e-12,
  );
});
test("undefined monthly Sharpe stays unavailable", () => {
  for (const rows of [
    [],
    [{ value: 1 }, { value: 2 }],
    [{ value: 1 }, { value: 1 }, { value: 1 }],
    [{ value: 0 }, { value: 1 }, { value: 2 }],
  ])
    assert.equal(monthlySharpe(rows), null);
});
test("activity uses only actual selected-strategy rebalance records", () => {
  const result = {
    results: [
      {
        id: "responsible",
        history: [
          { date: "a", rebalance: false },
          { date: "b", rebalance: true },
          { date: "c", rebalance: false },
          { date: "d", rebalance: true },
        ],
      },
    ],
  };
  assert.deepEqual(recentTrades(result, "responsible", 1), [
    { date: "d", rebalance: true },
  ]);
  assert.deepEqual(recentTrades(result, "missing"), []);
  assert.deepEqual(recentTrades(null, "responsible"), []);
});

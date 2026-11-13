import test from "node:test";
import assert from "node:assert/strict";
import {
  streamStatus,
  staleTrade,
  freshMarket,
  streamUrl,
  watchAssets,
} from "../src/lib/marketStream.js";
test("real-time coverage requires explicit successful subscription confirmation", () => {
  assert.equal(
    streamStatus({ connection_state: "connecting", feed: "sip" }),
    "Connecting",
  );
  assert.equal(
    streamStatus({
      connection_state: "connected",
      feed: "sip",
      subscription_confirmed: false,
    }),
    "Disconnected",
  );
  assert.equal(
    streamStatus({
      connection_state: "connected",
      feed: "sip",
      subscription_confirmed: true,
    }),
    "SIP Real-Time",
  );
  assert.equal(
    streamStatus({
      connection_state: "connected",
      feed: "iex",
      subscription_confirmed: true,
    }),
    "IEX Real-Time",
  );
  assert.equal(
    streamStatus({ connection_state: "unavailable", feed: "sip" }),
    "Unavailable",
  );
  assert(!watchAssets.some(([symbol]) => symbol === "CASH"));
});
test("stale trades use exchange time, not receive time or fabricated ticks", () => {
  const now = Date.now(),
    packet = { connection_state: "connected", subscription_confirmed: true };
  assert(staleTrade(null, packet, now));
  assert(
    staleTrade(
      {
        exchange_timestamp: new Date(now - 61000).toISOString(),
        received_at: new Date(now).toISOString(),
      },
      packet,
      now,
    ),
  );
  assert(
    !staleTrade(
      { exchange_timestamp: new Date(now - 1000).toISOString() },
      packet,
      now,
    ),
  );
  assert(
    staleTrade(
      { exchange_timestamp: new Date(now - 1000).toISOString() },
      { connection_state: "reconnecting" },
      now,
    ),
  );
});
test("market-closed status requires a fresh authoritative market clock", () => {
  const now = Date.now();
  const market = { is_open: false, checked_at: new Date(now).toISOString() };
  assert.equal(freshMarket({ market }, now), market);
  assert.equal(freshMarket({ market }, now + 120001), null);
  assert.equal(freshMarket({}, now), null);
});
test("internal WebSocket follows the same host and HTTPS security", () => {
  assert.equal(
    streamUrl({ protocol: "https:", host: "example.com" }),
    "wss://example.com/api/market/stream",
  );
  assert.equal(
    streamUrl({ protocol: "http:", host: "localhost:5173" }),
    "ws://localhost:5173/api/market/stream",
  );
});

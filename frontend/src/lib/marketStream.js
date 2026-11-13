export const watchAssets = [
  ["SPY", "S&P 500 ETF"],
  ["AGG", "US Aggregate Bond ETF"],
  ["GLD", "Gold ETF"],
  ["QQQ", "Nasdaq-100 ETF"],
];
export function freshMarket(packet, now) {
  const market = packet?.market;
  return market &&
    Number.isFinite(Date.parse(market.checked_at)) &&
    Math.abs(now - Date.parse(market.checked_at)) < 120000
    ? market
    : null;
}
export function streamStatus(packet) {
  if (
    packet?.connection_state === "connected" &&
    packet.subscription_confirmed &&
    ["iex", "sip"].includes(packet.feed)
  )
    return packet.feed === "sip" ? "SIP Real-Time" : "IEX Real-Time";
  return (
    {
      connecting: "Connecting",
      reconnecting: "Reconnecting",
      unavailable: "Unavailable",
    }[packet?.connection_state] || "Disconnected"
  );
}
export function staleTrade(quote, packet, now) {
  if (!quote || !Number.isFinite(Date.parse(quote.exchange_timestamp)))
    return true;
  return (
    packet?.connection_state !== "connected" ||
    !packet.subscription_confirmed ||
    now - Date.parse(quote.exchange_timestamp) > 60000
  );
}
export function streamUrl(location) {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/market/stream`;
}

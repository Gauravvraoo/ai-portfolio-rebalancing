import { useEffect, useState } from "react";
import { Activity, Radio, Clock3, ShieldCheck } from "lucide-react";
import {
  watchAssets,
  streamStatus,
  staleTrade,
  freshMarket,
  streamUrl,
} from "../lib/marketStream";
import styles from "./MarketWatch.module.css";
const formatTime = (value) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      })
    : "Unavailable";
const price = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
export default function MarketWatch() {
  const [packet, setPacket] = useState({
    connection_state: "connecting",
    quotes: {},
  });
  const [now, setNow] = useState(Date.now());
  const [paused, setPaused] = useState(document.visibilityState === "hidden");
  useEffect(() => {
    let stopped = false,
      socket = null,
      retry = null,
      attempt = 0;
    function close() {
      clearTimeout(retry);
      retry = null;
      if (socket) {
        socket.onopen =
          socket.onmessage =
          socket.onclose =
          socket.onerror =
            null;
        socket.close();
        socket = null;
      }
    }
    function connect() {
      if (stopped || document.visibilityState === "hidden" || socket) return;
      setPacket((current) => ({
        ...current,
        connection_state: "connecting",
        subscription_confirmed: false,
      }));
      socket = new WebSocket(streamUrl(window.location));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (
            message.type === "snapshot" &&
            message.quotes &&
            typeof message.quotes === "object"
          ) {
            if (
              message.connection_state === "connected" &&
              message.subscription_confirmed
            )
              attempt = 0;
            setPacket(message);
          }
        } catch {
          /* Never turn invalid frames into prices. */
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        socket = null;
        if (stopped || document.visibilityState === "hidden") return;
        setPacket((current) => ({
          ...current,
          connection_state: "disconnected",
          subscription_confirmed: false,
        }));
        retry = setTimeout(
          connect,
          Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)),
        );
      };
    }
    function visibility() {
      const hidden = document.visibilityState === "hidden";
      setPaused(hidden);
      close();
      if (hidden)
        setPacket((current) => ({
          ...current,
          connection_state: "disconnected",
          subscription_confirmed: false,
        }));
      else connect();
    }
    document.addEventListener("visibilitychange", visibility);
    connect();
    // Age/clock display only. This timer never generates trades or prices.
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(clock);
      close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const status = streamStatus(packet);
  const connected =
    packet.connection_state === "connected" && packet.subscription_confirmed;
  const market = freshMarket(packet, now);
  return (
    <section className={styles.panel} aria-labelledby="market-watch-title">
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.emblem}>
            <Radio size={23} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.eyebrow}>EXCHANGE TRADE STREAM</span>
            <h2 id="market-watch-title">Real-Time ETF Market Watch</h2>
          </div>
        </div>
        <span
          className={`${styles.status} ${connected ? styles.connected : ""}`}
          role="status"
        >
          <Activity size={14} aria-hidden="true" />
          {paused ? "Disconnected · page hidden" : status}
        </span>
      </div>
      <p className={styles.description}>
        {connected && packet.feed === "sip"
          ? "SIP consolidated real-time feed · subscription confirmed."
          : packet.feed === "sip"
            ? "SIP consolidated feed requested · access is unconfirmed."
            : packet.feed === "iex"
              ? "IEX exchange trades only · not full US market coverage."
              : "Awaiting the configured exchange feed."}{" "}
        Exchange trades are separate from Yahoo historical charts and research
        datasets.
      </p>
      {packet.message && (
        <p className={styles.error} role="alert">
          {packet.message}
        </p>
      )}
      <div className={styles.grid}>
        {watchAssets.map(([symbol, name]) => {
          const quote = packet.quotes?.[symbol];
          const stale = staleTrade(quote, packet, now);
          return (
            <article
              key={symbol}
              className={styles.card}
              aria-label={`${symbol} trade`}
            >
              <div className={styles.asset}>
                <strong>{symbol}</strong>
                <span>USD</span>
              </div>
              <p className={styles.name}>{name}</p>
              <div className={styles.price}>
                {quote && Number.isFinite(quote.price) && quote.price > 0
                  ? price(quote.price)
                  : "—"}
              </div>
              <p className={styles.change}>
                Daily change unavailable
                <span>No comparable previous-close reference</span>
              </p>
              <span className={stale ? styles.stale : styles.fresh}>
                {!connected
                  ? quote
                    ? "Stale trade · disconnected"
                    : "No trade available"
                  : stale
                    ? "No recent trades"
                    : "Recent exchange trade"}
              </span>
              <dl>
                <div>
                  <dt>Exchange timestamp</dt>
                  <dd title={quote?.exchange_timestamp}>
                    {formatTime(quote?.exchange_timestamp)}
                  </dd>
                </div>
                <div>
                  <dt>Received by backend</dt>
                  <dd title={quote?.received_at}>
                    {formatTime(quote?.received_at)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
      <div className={styles.footer}>
        <span>
          <Clock3 size={14} aria-hidden="true" />
          {market
            ? market.is_open
              ? "Regular session open"
              : "Market Closed · regular session"
            : "Market session status unavailable"}
        </span>
        <span>
          Regular hours: 9:30 am–4:00 pm America/New_York; holidays and early
          closes vary.
        </span>
        <span className={styles.clock}>
          New York time:{" "}
          {new Date(now).toLocaleTimeString("en-US", {
            timeZone: "America/New_York",
            timeZoneName: "short",
          })}
        </span>
      </div>
      {market && (
        <p className={styles.session}>
          {market.is_open ? "Next regular close" : "Next regular open"}:{" "}
          {formatTime(market.is_open ? market.next_close : market.next_open)} ·
          Status from Alpaca account clock
        </p>
      )}
      <p className={styles.disclosure}>
        <ShieldCheck size={13} aria-hidden="true" />
        Provider: Alpaca Market Data. Last received trade, not a bid/ask quote
        or guaranteed execution price. No CASH quote, delayed-feed fallback,
        synthetic ticks, or trading orders. Requires appropriate market-data
        entitlements; personal authorized research use only.
      </p>
    </section>
  );
}

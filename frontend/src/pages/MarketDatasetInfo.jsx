import {
  Database,
  Building2,
  CalendarRange,
  Activity,
  CalendarDays,
  Layers3,
  History,
} from "lucide-react";
import styles from "./MarketDatasetInfo.module.css";

function Detail({ icon: Icon, label, children, note }) {
  return (
    <div className={styles.detail}>
      <div className={styles.label}>
        <Icon size={15} aria-hidden="true" />
        {label}
      </div>
      <strong>{children}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

// Presentation only: uses the Market page's existing response without new requests.
export default function MarketDatasetInfo({ dataset }) {
  const metadata = dataset.data || {};
  const real = metadata.data_source === "real";
  const synthetic = metadata.data_source === "synthetic";
  const tracked = dataset.assets
    .filter((asset) => asset.symbol !== "CASH")
    .map((asset) => asset.symbol);
  const firstDate = metadata.start_date || dataset.history[0]?.date;
  const lastDate = metadata.end_date || dataset.history.at(-1)?.date;
  return (
    <section
      className={styles.panel}
      aria-labelledby="market-dataset-info-title"
    >
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.emblem}>
            <Database size={23} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.eyebrow}>DATASET INTELLIGENCE</span>
            <h2 id="market-dataset-info-title">
              {real
                ? "Historical Market Data"
                : synthetic
                  ? "Synthetic Demo Dataset"
                  : "Market Dataset Information"}
            </h2>
          </div>
        </div>
        <span className={styles.badge}>
          <History size={14} aria-hidden="true" />
          {real
            ? "Historical data, not live streaming"
            : synthetic
              ? "Synthetic data · educational only"
              : "Source not disclosed · not live"}
        </span>
      </div>
      <div className={styles.grid}>
        <Detail icon={Database} label="Data source">
          {real
            ? "Real historical market data"
            : synthetic
              ? "Synthetic Demo"
              : "Not disclosed"}
        </Detail>
        <Detail icon={Building2} label="Provider">
          {metadata.provider || "Not disclosed"}
        </Detail>
        <Detail
          icon={CalendarRange}
          label="Historical date range"
          note={
            real && metadata.data_range
              ? `${metadata.data_range} selected window`
              : undefined
          }
        >
          {firstDate || "Unavailable"}{" "}
          <span className={styles.dateArrow}>→</span>{" "}
          {lastDate || "Unavailable"}
        </Detail>
        <Detail
          icon={Activity}
          label={
            real ? "Aligned trading observations" : "Synthetic observations"
          }
        >
          {dataset.history.length.toLocaleString("en-US")}
          <span className={styles.unit}>
            {" "}
            {real ? "daily closes" : "sample dates"}
          </span>
        </Detail>
        <Detail
          icon={CalendarDays}
          label={real ? "Last trading date" : "Last sample date"}
        >
          {(real ? metadata.last_trading_date : null) ||
            lastDate ||
            "Unavailable"}
        </Detail>
        <Detail
          icon={Layers3}
          label="Tracked ETFs"
          note={
            synthetic
              ? "Simulated ETF series, not market observations"
              : undefined
          }
        >
          {tracked.length}
          <span className={styles.symbols}>
            {tracked.join(" · ") || "None returned"}
          </span>
        </Detail>
      </div>
      <div className={styles.footer}>
        <span>
          {metadata.price_adjustment || "Price adjustment status not disclosed"}
        </span>
        <span>
          CASH yield is an assumption. ESG scores are illustrative, not verified
          ratings.
        </span>
      </div>
      {metadata.fallback_used && (
        <p className={styles.fallback}>
          Explicitly configured provider fallback used (
          {metadata.primary_provider} → {metadata.provider_id};{" "}
          {metadata.fallback_reason?.code})
        </p>
      )}
      <details className={styles.provenance}>
        <summary>Retrieval & provenance details</summary>
        <div>
          {metadata.fetched_at && <p>Retrieved: {metadata.fetched_at}</p>}
          {metadata.cache_hit !== undefined && (
            <p>
              {metadata.cache_hit
                ? "Cached response (up to 6 hours; refresh requests coalesce for 60 seconds)"
                : "Fetched provider response"}
            </p>
          )}
          <p>
            {real
              ? "Historical daily data, not live or real-time streaming. No synthetic market prices are substituted."
              : synthetic
                ? "Repository synthetic sample, not downloaded historical prices."
                : "Provider and source metadata are unavailable."}
          </p>
        </div>
      </details>
    </section>
  );
}

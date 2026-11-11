import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
export const colors = ["#a5e87c", "#7ca8ef", "#e6c279", "#b095ee", "#758692"];
export const money = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
export const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
export function Panel({ title, subtitle, children, action, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function State({ resource, children }) {
  if (resource.loading)
    return (
      <div className="panel state" role="status">
        <span className="spinner" /> Loading simulation data…
      </div>
    );
  if (resource.error)
    return (
      <div className="panel state" role="alert">
        <p>{resource.error}</p>
        <button onClick={resource.retry}>Try again</button>
      </div>
    );
  return children(resource.data);
}
export function PerformanceChart({ data, lines, value = true }) {
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        value
          ? "Portfolio value over the sample period"
          : "Asset returns over the sample period"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {lines ? (
          <LineChart data={data}>
            <CartesianGrid stroke="#24303a" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => v.slice(5, 7)}
              stroke="#768594"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#768594"
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#17212b",
                border: "1px solid #34404b",
                borderRadius: 10,
              }}
              formatter={(v) => `${Number(v).toFixed(2)}%`}
            />
            {lines.map((s, i) => (
              <Line
                isAnimationActive={false}
                key={s}
                type="monotone"
                dataKey={s}
                stroke={colors[i]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a5e87c" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#a5e87c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#24303a" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) =>
                new Date(v + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                })
              }
              stroke="#768594"
              tickLine={false}
              axisLine={false}
              minTickGap={25}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              stroke="#768594"
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "#17212b",
                border: "1px solid #34404b",
                borderRadius: 10,
              }}
              formatter={(v) => money(v)}
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="value"
              name="Portfolio value"
              stroke="#a5e87c"
              strokeWidth={2.5}
              fill="url(#green)"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function Holdings({ holdings }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Sample price</th>
            <th>Period return</th>
            <th>Weight</th>
            <th>Illustrative ESG</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((a, i) => (
            <tr key={a.symbol}>
              <td>
                <div className="asset">
                  <span
                    className="asset-icon"
                    style={{ color: colors[i], background: colors[i] + "15" }}
                  >
                    {a.symbol.slice(0, 1)}
                  </span>
                  <div>
                    <strong>{a.symbol}</strong>
                    <small>{a.name}</small>
                  </div>
                </div>
              </td>
              <td>{money(a.price)}</td>
              <td className={a.period_return >= 0 ? "positive" : "negative"}>
                {pct(a.period_return)}
              </td>
              <td>{(a.current_weight * 100).toFixed(1)}%</td>
              <td>
                <span className="esg-tag">{a.illustrative_esg} / 100</span>
              </td>
              <td>{money(a.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

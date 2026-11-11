import { useId } from "react";
import { Loading, ErrorState } from "./Design";
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
export const colors = ["#648cff", "#39c8bc", "#ad8cfa", "#f5bd72", "#8494ac"];
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
      <div className="panel">
        <Loading />
      </div>
    );
  if (resource.error)
    return (
      <div className="panel">
        <ErrorState message={resource.error} retry={resource.retry} />
      </div>
    );
  return children(resource.data);
}
export function PerformanceChart({
  data,
  lines,
  value = true,
  percentage = false,
}) {
  const gradient = useId().replaceAll(":", "");
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        value
          ? percentage
            ? "Cumulative portfolio return over the sample period"
            : "Portfolio value over the sample period"
          : "Asset returns over the sample period"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {lines ? (
          <LineChart data={data}>
            <CartesianGrid stroke="#26354b" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => v.slice(5, 7)}
              stroke="#9baac0"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#9baac0"
              tickFormatter={(v) => `${v}%`}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#182337",
                border: "1px solid #34445e",
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
                stroke={
                  colors[["SPY", "AGG", "GLD", "QQQ", "CASH"].indexOf(s)] ||
                  colors[i]
                }
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : (
          <AreaChart data={data}>
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#648cff" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#648cff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#26354b" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) =>
                new Date(v + "T00:00:00").toLocaleDateString("en-US", {
                  month: "short",
                })
              }
              stroke="#9baac0"
              tickLine={false}
              axisLine={false}
              minTickGap={25}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(v) =>
                percentage ? `${v.toFixed(0)}%` : `$${(v / 1000).toFixed(0)}k`
              }
              stroke="#9baac0"
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: "#182337",
                border: "1px solid #34445e",
                borderRadius: 10,
              }}
              formatter={(v) =>
                percentage ? `${Number(v).toFixed(2)}%` : money(v)
              }
            />
            <Area
              isAnimationActive={false}
              type="monotone"
              dataKey="value"
              name="Portfolio value"
              stroke="#648cff"
              strokeWidth={2.5}
              fill={`url(#${gradient})`}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function Holdings({ holdings }) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Scrollable data table"
    >
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

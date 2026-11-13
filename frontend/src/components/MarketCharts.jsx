import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ReferenceLine,
} from "recharts";
import { colors } from "./UI";
const assetColor = (symbol) =>
  colors[["SPY", "AGG", "GLD", "QQQ", "CASH"].indexOf(symbol)];
const tooltip = {
  background: "#182337",
  border: "1px solid #34445e",
  borderRadius: 10,
  color: "#edf2fa",
};
const percent = (value) => `${Number(value).toFixed(2)}%`;
export function MarketPerformance({ data, lines }) {
  return (
    <div
      className="market-history-chart"
      role="img"
      aria-label="Historical cumulative asset returns in percent by observation date"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 18, right: 16, bottom: 24, left: 6 }}
        >
          <CartesianGrid stroke="#26354b" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#9baac0"
            minTickGap={48}
            tickLine={false}
            tickFormatter={(v) =>
              new Date(`${v}T00:00:00`).toLocaleDateString("en-US", {
                month: "short",
                year: "2-digit",
              })
            }
            label={{
              value: "Observation date",
              position: "bottom",
              fill: "#9baac0",
            }}
          />
          <YAxis
            stroke="#9baac0"
            width={64}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <ReferenceLine y={0} stroke="#718098" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={tooltip}
            formatter={percent}
            labelFormatter={(date) => `Observation: ${date}`}
          />
          {lines.map((symbol) => (
            <Line
              key={symbol}
              dataKey={symbol}
              name={symbol === "CASH" ? "CASH (assumed)" : symbol}
              stroke={assetColor(symbol)}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function RiskComparison({ assets }) {
  return (
    <div
      className="market-risk-chart"
      role="img"
      aria-label="Asset cumulative return and annualized volatility comparison in percent"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={assets}
          margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
        >
          <CartesianGrid stroke="#26354b" vertical={false} />
          <XAxis dataKey="symbol" stroke="#9baac0" tickLine={false} />
          <YAxis stroke="#9baac0" tickFormatter={(v) => `${v}%`} width={62} />
          <Tooltip
            contentStyle={tooltip}
            formatter={percent}
            labelFormatter={(symbol) =>
              symbol === "CASH" ? "CASH · assumed account return" : symbol
            }
          />
          <Legend wrapperStyle={{ paddingTop: 16 }} />
          <ReferenceLine y={0} stroke="#718098" />
          <Bar
            dataKey="period_return"
            name="Period return"
            fill="#648cff"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="annualized_volatility"
            name="Annualized volatility"
            fill="#39c8bc"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function CorrelationHeatmap({ assets, correlation }) {
  return (
    <>
      <div
        className="table-scroll market-heatmap"
        tabIndex={0}
        role="region"
        aria-label="Return correlation matrix"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              {assets.map((a) => (
                <th scope="col" key={a.symbol}>
                  {a.symbol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol}>
                <th scope="row">{a.symbol}</th>
                {assets.map((b) => {
                  const value = correlation[a.symbol]?.[b.symbol];
                  return (
                    <td
                      key={b.symbol}
                      title={`${a.symbol} / ${b.symbol}: ${value == null ? "Undefined for constant returns" : value.toFixed(3)}`}
                      style={{
                        background:
                          value == null
                            ? "#182337"
                            : `rgba(${value < 0 ? "164, 98, 79" : "48, 152, 145"}, ${0.12 + Math.abs(value) * 0.5})`,
                      }}
                    >
                      {value == null ? "N/A" : value.toFixed(2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heatmap-scale">
        <span>−1 · opposite</span>
        <i />
        <span>+1 · together</span>
      </div>
      <p className="muted">
        N/A means undefined, including constant CASH returns. Correlation
        describes this historical window and can change.
      </p>
    </>
  );
}

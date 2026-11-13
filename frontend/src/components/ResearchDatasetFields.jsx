import { useDataSource } from "./DataSource";

// Form-specific research inputs. Dataset state stays shared; the Market header
// and its provenance/quote presentation are not mounted in research forms.
export default function ResearchDatasetFields({ purpose }) {
  const { source, range, change } = useDataSource();
  return (
    <div
      className="config-fields"
      role="group"
      aria-label={`${purpose} dataset selection`}
    >
      <label className="config-field">
        {purpose} data source
        <select
          aria-label={`${purpose} data source`}
          value={source}
          onChange={(event) => change({ source: event.target.value })}
        >
          <option value="synthetic">Synthetic Demo</option>
          <option value="real">Real Historical Market Data</option>
        </select>
      </label>
      <label className="config-field">
        {purpose} historical range
        <select
          aria-label={`${purpose} historical range`}
          value={range}
          disabled={source !== "real"}
          onChange={(event) => change({ range: event.target.value })}
        >
          {["1Y", "3Y", "5Y"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

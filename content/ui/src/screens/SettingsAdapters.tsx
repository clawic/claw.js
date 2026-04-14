import { useApi } from "../hooks/useApi";
import { getDestinations, getBrands } from "../api/client";
import type { Destination, Brand } from "../api/types";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";

export function SettingsAdaptersScreen() {
  const { status: dStatus, data: dData, error: dError, reload: dReload } = useApi<{ items: Destination[] }>(getDestinations);
  const { data: bData } = useApi<{ brands: Brand[] }>(getBrands);

  const destinations = dData?.items ?? [];
  const brands = bData?.brands ?? [];

  if (dStatus === "loading") return <LoadingSkeleton rows={6} />;
  if (dStatus === "error") return <ErrorBlock message={dError!} onRetry={dReload} />;

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-5)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Settings</h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>Adapters and connection configuration</p>
        </div>
        <button className="btn btn--secondary btn--sm" onClick={dReload}>Refresh</button>
      </div>

      {/* Brands section */}
      <section style={{ marginBottom: "var(--sp-8)" }}>
        <h2 style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginBottom: "var(--sp-3)", paddingBottom: "var(--sp-2)", borderBottom: "2px solid var(--c-border)" }}>Brands</h2>
        {brands.length === 0 ? (
          <p style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)" }}>No brands configured.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Slug</th><th>Locale</th><th>Tags</th></tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{b.slug}</td>
                    <td>{b.defaultLocale}</td>
                    <td>{b.tags.length > 0 ? b.tags.join(", ") : <span style={{ color: "var(--c-text-muted)" }}>None</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Adapters section */}
      <section>
        <h2 style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginBottom: "var(--sp-3)", paddingBottom: "var(--sp-2)", borderBottom: "2px solid var(--c-border)" }}>Adapters (Destinations)</h2>
        {destinations.length === 0 ? (
          <p style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-sm)" }}>No adapters configured.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Kind</th><th>Health</th><th>Policy</th><th>Secret</th><th>Last Checked</th></tr>
              </thead>
              <tbody>
                {destinations.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td style={{ fontSize: "var(--fs-xs)" }}>{d.kind}</td>
                    <td>
                      <Badge variant={d.status === "active" ? "success" : d.status === "error" ? "danger" : "warning"}>
                        {d.status}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={d.publishPolicy === "autopublish" ? "success" : d.publishPolicy === "conditional" ? "warning" : "info"}>
                        {d.publishPolicy}
                      </Badge>
                    </td>
                    <td style={{ color: d.secretRef ? "var(--c-success)" : "var(--c-text-muted)", fontWeight: 600, fontSize: "var(--fs-sm)" }}>
                      {d.secretRef ? "Configured" : "Not set"}
                    </td>
                    <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{d.lastCheckedAt ? new Date(d.lastCheckedAt).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

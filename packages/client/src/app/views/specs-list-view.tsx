import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import { CustomSelect } from "../components/custom-select.js";
import { formatDateTime } from "../utils/date-format.js";

interface SpecsListViewProps {
  snapshot: ArtifactsSnapshot;
}

const SPEC_TYPE_LABELS: Record<string, string> = {
  brief: "Brief",
  "core-flows": "Core flows",
  prd: "PRD",
  "tech-spec": "Tech spec",
  decision: "Decision"
};

export const SpecsListView = ({ snapshot }: SpecsListViewProps) => {
  const [initiativeFilter, setInitiativeFilter] = useState("");
  const [search, setSearch] = useState("");

  const initiativeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const init of snapshot.initiatives) {
      map.set(init.id, init.title);
    }
    return map;
  }, [snapshot.initiatives]);

  const filtered = useMemo(() => {
    let result = snapshot.specs;
    if (initiativeFilter) {
      result = result.filter((s) => s.initiativeId === initiativeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }
    return result;
  }, [snapshot.specs, initiativeFilter, search]);

  const hasAnySpecs = snapshot.specs.length > 0;
  const isFiltered = initiativeFilter || search.trim();

  return (
    <section>
      <header className="section-header">
        <h2>Specs</h2>
        {hasAnySpecs && (
          <p>
            {isFiltered
              ? `${filtered.length} of ${snapshot.specs.length} spec${snapshot.specs.length !== 1 ? "s" : ""}`
              : `${snapshot.specs.length} spec${snapshot.specs.length !== 1 ? "s" : ""}`}
          </p>
        )}
      </header>

      <div className="aggregate-filters">
        <input
          type="text"
          placeholder="Search specs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="aggregate-search"
        />
        <CustomSelect
          options={[{ value: "", label: "All projects" }, ...snapshot.initiatives.map((init) => ({ value: init.id, label: init.title }))]}
          value={initiativeFilter}
          onChange={setInitiativeFilter}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="aggregate-empty empty-state">
          <p>{hasAnySpecs ? "No planning docs match these filters." : "No planning docs yet"}</p>
          {!hasAnySpecs && (
            <p className="aggregate-empty-hint empty-state-hint">
              Briefs, core flows, PRDs, and tech specs appear as you shape a project.
            </p>
          )}
        </div>
      ) : (
        <div className="panel">
          <table className="aggregate-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Project</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((spec) => (
                <tr key={spec.id}>
                  <td>
                    {spec.initiativeId ? (
                      <Link to={`/initiative/${spec.initiativeId}/spec/${spec.type}`}>
                        {spec.title}
                      </Link>
                    ) : (
                      <span>{spec.title}</span>
                    )}
                  </td>
                  <td>
                    <span className="badge">{SPEC_TYPE_LABELS[spec.type] ?? spec.type}</span>
                  </td>
                  <td className="aggregate-table-muted">
                    {spec.initiativeId ? (
                      <Link to={`/initiative/${spec.initiativeId}`} className="aggregate-table-link-muted">
                        {initiativeMap.get(spec.initiativeId) ?? spec.initiativeId}
                      </Link>
                    ) : "--"}
                  </td>
                  <td className="aggregate-table-muted">
                    {formatDateTime(spec.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

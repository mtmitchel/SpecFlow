export const findDiffRowsForFinding = (diff: string, file: string, line: number | null): Set<number> => {
  if (!file || line === null) {
    return new Set<number>();
  }

  const rows = new Set<number>();
  const lines = diff.split("\n");
  let currentFile: string | null = null;
  let currentLine = 0;

  for (const [index, row] of lines.entries()) {
    if (row.startsWith("+++ b/")) {
      currentFile = row.slice(6).trim();
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      currentLine = Number.parseInt(hunk[1], 10);
      continue;
    }

    if (row.startsWith("+") && !row.startsWith("+++")) {
      if (currentFile === file && currentLine === line) {
        rows.add(index + 1);
      }
      currentLine += 1;
      continue;
    }

    if (!row.startsWith("-")) {
      currentLine += 1;
    }
  }

  return rows;
};

export const DiffViewer = ({
  title,
  diff,
  highlightedRows
}: {
  title: string;
  diff: string;
  highlightedRows?: Set<number>;
}): JSX.Element => (
  <div className="panel">
    <h4>{title}</h4>
    <div className="diff-viewer">
      {diff.split("\n").map((line, index) => (
        <div
          key={`${title}-${index}`}
          className={highlightedRows?.has(index + 1) ? "diff-row highlight" : "diff-row"}
        >
          <span className="diff-line-number">{index + 1}</span>
          <code>{line || " "}</code>
        </div>
      ))}
    </div>
  </div>
);

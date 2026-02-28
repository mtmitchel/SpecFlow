export const MarkdownView = ({ content }: { content: string }): JSX.Element => {
  const lines = content.split("\n");

  return (
    <div className="markdown-view">
      {lines.map((line, index) => {
        if (line.startsWith("### ")) {
          return <h4 key={`md-${index}`}>{line.slice(4)}</h4>;
        }

        if (line.startsWith("## ")) {
          return <h3 key={`md-${index}`}>{line.slice(3)}</h3>;
        }

        if (line.startsWith("# ")) {
          return <h2 key={`md-${index}`}>{line.slice(2)}</h2>;
        }

        if (line.startsWith("- ")) {
          return (
            <div key={`md-${index}`} className="md-li">
              • {line.slice(2)}
            </div>
          );
        }

        if (!line.trim()) {
          return <div key={`md-${index}`} className="md-gap" />;
        }

        return <p key={`md-${index}`}>{line}</p>;
      })}
    </div>
  );
};

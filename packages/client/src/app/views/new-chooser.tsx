import { Link } from "react-router-dom";

const DocumentIcon = () => (
  <span className="new-chooser-card-icon">
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  </span>
);

const LightningIcon = () => (
  <span className="new-chooser-card-icon">
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  </span>
);

export const NewChooser = () => (
  <section className="new-chooser">
    <h2 className="new-chooser-title">Start something new</h2>
    <div className="new-chooser-options">
      <Link to="/new-initiative" className="new-chooser-card">
        <span className="new-chooser-card-title">
          <DocumentIcon />
          Initiative
        </span>
        <span className="new-chooser-card-desc">
          Use the full planning flow for multi-step work.
        </span>
      </Link>
      <Link to="/new-quick-task" className="new-chooser-card">
        <span className="new-chooser-card-title">
          <LightningIcon />
          Quick task
        </span>
        <span className="new-chooser-card-desc">
          Start with a short task. It moves into planning if it needs more structure.
        </span>
      </Link>
    </div>
  </section>
);

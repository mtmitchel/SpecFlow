import { Link } from "react-router-dom";

export const NewChooser = () => (
  <section className="new-chooser">
    <h2 className="new-chooser-title">Start something new</h2>
    <div className="new-chooser-options">
      <Link to="/new-initiative" className="new-chooser-card">
        <span className="new-chooser-card-title">Initiative</span>
        <span className="new-chooser-card-desc">
          Use the full planning flow for multi-step work.
        </span>
      </Link>
      <Link to="/new-quick-task" className="new-chooser-card">
        <span className="new-chooser-card-title">Quick task</span>
        <span className="new-chooser-card-desc">
          Start with a short task. It moves into planning if it needs more structure.
        </span>
      </Link>
    </div>
  </section>
);

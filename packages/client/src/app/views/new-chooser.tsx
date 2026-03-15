import { Link } from "react-router-dom";

export const NewChooser = () => (
  <section className="new-chooser">
    <h2 className="new-chooser-title">Create</h2>
    <div className="new-chooser-options">
      <Link to="/new-initiative" className="new-chooser-card">
        <span className="new-chooser-card-title">New Initiative</span>
        <span className="new-chooser-card-desc">
          Plan a multi-phase project with AI-generated specs and tickets
        </span>
      </Link>
      <Link to="/new-quick-task" className="new-chooser-card">
        <span className="new-chooser-card-title">Quick Task</span>
        <span className="new-chooser-card-desc">
          Describe a task for AI triage into a ticket or initiative
        </span>
      </Link>
    </div>
  </section>
);

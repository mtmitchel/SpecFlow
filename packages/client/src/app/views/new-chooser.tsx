import { Link } from "react-router-dom";

export const NewChooser = () => (
  <section className="new-chooser">
    <h2 className="new-chooser-title">Choose a starting path</h2>
    <div className="new-chooser-options">
      <Link to="/new-initiative" className="new-chooser-card">
        <span className="new-chooser-card-title">Start planning</span>
        <span className="new-chooser-card-desc">
          Use the full planning spectrum for work that needs a brief, core flows, PRD, tech spec, and tickets.
        </span>
      </Link>
      <Link to="/new-quick-task" className="new-chooser-card">
        <span className="new-chooser-card-title">Quick Task</span>
        <span className="new-chooser-card-desc">
          Start with a short task description. SpecFlow will keep it short or promote it into planning.
        </span>
      </Link>
    </div>
  </section>
);

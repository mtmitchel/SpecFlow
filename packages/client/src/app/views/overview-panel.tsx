import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import { Pipeline } from "../components/pipeline.js";
import {
  getInitiativeProgressModel,
  getInitiativeResumeHref,
  getInitiativeShellHref,
} from "../utils/initiative-progress.js";
import { getInitiativeQueueActionLabel, getStandaloneTicketActionLabel } from "../utils/ui-language.js";

const modKey =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? "Cmd"
    : "Ctrl";

interface QueueAction {
  id: string;
  href: string;
  initiativeName: string;
  label: string;
  priority: number;
  updatedAt: string;
  tone: "planning" | "review" | "execution" | "verify" | "audit";
}

interface RecentRunLink {
  id: string;
  href: string;
  kicker: string;
  title: string;
  context: string;
  tone: "execution" | "audit";
}

const ACTION_TONE_LABELS: Record<QueueAction["tone"], string> = {
  planning: "Plan",
  review: "Review",
  execution: "Execute",
  verify: "Verify",
  audit: "Audit",
};

export const OverviewPanel = ({
  snapshot,
  onOpenCommandPalette: _onOpenCommandPalette,
}: {
  snapshot: ArtifactsSnapshot;
  onOpenCommandPalette: () => void;
}) => {
  const ticketMap = useMemo(
    () => new Map(snapshot.tickets.map((ticket) => [ticket.id, ticket])),
    [snapshot.tickets],
  );
  const initiativeMap = useMemo(
    () => new Map(snapshot.initiatives.map((initiative) => [initiative.id, initiative])),
    [snapshot.initiatives],
  );
  const initiativeCards = useMemo(
    () =>
      snapshot.initiatives
        .map((initiative) => ({
          initiative,
          progress: getInitiativeProgressModel(initiative, snapshot),
        }))
        .sort((left, right) => new Date(right.initiative.updatedAt).getTime() - new Date(left.initiative.updatedAt).getTime()),
    [snapshot],
  );

  const upNext = useMemo(() => {
    const actions: QueueAction[] = [];

    for (const { initiative, progress } of initiativeCards) {
      if (progress.currentKey === "done") {
        continue;
      }

      if (progress.resumeTicket) {
        actions.push({
          id: `${initiative.id}:${progress.resumeTicket.id}`,
          href: `/ticket/${progress.resumeTicket.id}`,
          initiativeName: initiative.title,
          label: getInitiativeQueueActionLabel(initiative, progress),
          priority: progress.resumeTicket.status === "verify" ? 3 : 4,
          updatedAt: progress.resumeTicket.updatedAt,
          tone: progress.resumeTicket.status === "verify" ? "verify" : "execution",
        });
        continue;
      }

      if (progress.currentKey === "execute" || progress.currentKey === "verify") {
        if (progress.nextTicket) {
          actions.push({
            id: `${initiative.id}:${progress.nextTicket.id}`,
            href: `/ticket/${progress.nextTicket.id}`,
            initiativeName: initiative.title,
            label: getInitiativeQueueActionLabel(initiative, progress),
            priority: progress.currentKey === "verify" ? 3 : 4,
            updatedAt: progress.nextTicket.updatedAt,
            tone: progress.currentKey === "verify" ? "verify" : "execution",
          });
        }
        continue;
      }

      const currentNode = progress.nodes.find((node) => node.key === progress.currentKey);
      actions.push({
        id: initiative.id,
        href: getInitiativeResumeHref(initiative, progress, snapshot),
        initiativeName: initiative.title,
        label: getInitiativeQueueActionLabel(initiative, progress),
        priority: currentNode?.state === "checkpoint" ? 1 : 2,
        updatedAt: initiative.updatedAt,
        tone: currentNode?.state === "checkpoint" ? "review" : "planning",
      });
    }

    for (const ticket of snapshot.tickets.filter((candidate) => !candidate.initiativeId && candidate.status === "verify")) {
      actions.push({
        id: `quick-verify:${ticket.id}`,
        href: `/ticket/${ticket.id}`,
        initiativeName: "Quick task",
        label: getStandaloneTicketActionLabel(ticket),
        priority: 3,
        updatedAt: ticket.updatedAt,
        tone: "verify",
      });
    }

    return actions
      .sort((left, right) => {
        const priority = left.priority - right.priority;
        if (priority !== 0) {
          return priority;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })
      .slice(0, 6);
  }, [initiativeCards, snapshot]);
  const recentRuns = useMemo(
    () =>
      [...snapshot.runs]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 4)
        .map<RecentRunLink>((run) => {
          const ticket = run.ticketId ? ticketMap.get(run.ticketId) ?? null : null;
          const initiative =
            ticket?.initiativeId ? initiativeMap.get(ticket.initiativeId) ?? null : null;

          return {
            id: run.id,
            href: `/run/${run.id}`,
            kicker: run.type === "audit" ? "Audit report" : "Run report",
            title: ticket?.title ?? run.id,
            context: `${initiative?.title ?? (ticket ? "Quick task" : "Standalone run")} · ${run.id}`,
            tone: run.type === "audit" ? "audit" : "execution",
          };
        }),
    [initiativeMap, snapshot.runs, ticketMap],
  );
  const primaryAction = upNext[0] ?? null;
  const secondaryActions = primaryAction ? upNext.slice(1) : [];

  return (
    <section className="journey-home-shell">
      {primaryAction ? (
        <div className="journey-home-section">
          <div className="action-queue-heading">Up next</div>
          <Link
            to={primaryAction.href}
            className={`action-queue-row action-queue-row-${primaryAction.tone} featured action-queue-row-resume`}
          >
            <span className={`action-queue-icon action-queue-icon-${primaryAction.tone}`} aria-hidden="true">
              {ACTION_TONE_LABELS[primaryAction.tone].slice(0, 1)}
            </span>
            <div className="action-queue-main">
              <span className="action-queue-kicker">Resume work</span>
              <span className="action-queue-title">{primaryAction.label}</span>
              <span className="action-queue-context">{primaryAction.initiativeName}</span>
            </div>
            <div className="action-queue-trailing">
              <span className="action-queue-arrow" aria-hidden="true">
                →
              </span>
            </div>
          </Link>
        </div>
      ) : (
        <div className="journey-queue-empty-state">
          <p className="journey-queue-empty-lead">No work is in motion yet.</p>
          <p className="journey-queue-empty-copy">Start planning for multi-step work, use a quick task for something small, or press <kbd className="dash-kbd">{modKey}+K</kbd>.</p>
        </div>
      )}

      {secondaryActions.length > 0 ? (
        <div className="journey-home-section action-queue">
          <div className="action-queue-heading">More in progress</div>
          <div className="action-queue-list">
            {secondaryActions.map((action) => (
              <Link
                key={action.id}
                to={action.href}
                className={`action-queue-row action-queue-row-${action.tone}`}
              >
                <span className={`action-queue-icon action-queue-icon-${action.tone}`} aria-hidden="true">
                  {ACTION_TONE_LABELS[action.tone].slice(0, 1)}
                </span>
                <div className="action-queue-main">
                  <span className="action-queue-title">{action.label}</span>
                  <span className="action-queue-context">{action.initiativeName}</span>
                </div>
                <div className="action-queue-trailing">
                  <span className="action-queue-arrow" aria-hidden="true">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {recentRuns.length > 0 ? (
        <div className="journey-home-section action-queue">
          <div className="action-queue-heading">Recent runs</div>
          <div className="action-queue-list">
            {recentRuns.map((run) => (
              <Link
                key={run.id}
                to={run.href}
                className={`action-queue-row action-queue-row-${run.tone}`}
              >
                <span className={`action-queue-icon action-queue-icon-${run.tone}`} aria-hidden="true">
                  {ACTION_TONE_LABELS[run.tone].slice(0, 1)}
                </span>
                <div className="action-queue-main">
                  <span className="action-queue-kicker">{run.kicker}</span>
                  <span className="action-queue-title">{run.title}</span>
                  <span className="action-queue-context">{run.context}</span>
                </div>
                <div className="action-queue-trailing">
                  <span className="action-queue-arrow" aria-hidden="true">
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="journey-home-section">
        <div className="action-queue-heading">Projects</div>
        <div className="initiative-card-grid">
        {initiativeCards.map(({ initiative, progress }) => (
          <Link key={initiative.id} to={getInitiativeShellHref(initiative, progress, snapshot)} className="initiative-card">
            <div className="initiative-card-top">
              <div>
                <h3>{initiative.title}</h3>
                <p>{initiative.description}</p>
              </div>
            </div>

            <Pipeline nodes={progress.nodes} />

            {progress.ticketProgress.total > 0 ? (
              <div className="initiative-card-progress">
                <span>
                  {progress.ticketProgress.done}/{progress.ticketProgress.total} tickets
                </span>
                <div className="initiative-card-progress-bar">
                  <div
                    className="initiative-card-progress-fill"
                    style={{
                      width: `${(progress.ticketProgress.done / progress.ticketProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="initiative-card-footer">
              <span>Open project</span>
              <span aria-hidden="true">→</span>
            </div>
          </Link>
        ))}

        <Link to="/new-initiative" className="initiative-card initiative-card-new">
          <span>Start new project</span>
        </Link>
      </div>
      </div>
    </section>
  );
};

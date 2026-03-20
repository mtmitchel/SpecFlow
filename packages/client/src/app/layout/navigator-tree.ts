import type { ArtifactsSnapshot, Initiative, Ticket, TicketStatus } from "../../types.js";
import { getInitiativeProgressModel, getInitiativeShellHref } from "../utils/initiative-progress.js";
import { getInitiativeDisplayTitle } from "../utils/initiative-titles.js";

export type NavigatorNodeType =
  | "section-header"
  | "initiative"
  | "phase"
  | "ticket"
  | "quick-tasks-header"
  | "quick-task"
  | "aggregate-link";

export interface NavigatorNode {
  id: string;
  type: NavigatorNodeType;
  label: string;
  path: string;
  status?: string;
  ticketStatus?: TicketStatus;
  children?: NavigatorNode[];
}

const statusDotClass = (status: Initiative["status"]): string => {
  if (status === "active") return "active";
  if (status === "done") return "done";
  return "draft";
};

export const buildNavigatorTree = (snapshot: ArtifactsSnapshot): NavigatorNode[] => {
  const { initiatives, tickets } = snapshot;
  const nodes: NavigatorNode[] = [];

  if (initiatives.length > 0) {
    nodes.push({
      id: "initiatives-header",
      type: "section-header",
      label: "Initiatives",
      path: "/"
    });
  }

  for (const initiative of initiatives) {
    const initiativeTickets = tickets.filter((t) => t.initiativeId === initiative.id);
    const initiativeProgress = getInitiativeProgressModel(initiative, snapshot);
    const initiativePath = getInitiativeShellHref(initiative, initiativeProgress, snapshot);

    const children: NavigatorNode[] = [];

    if (initiative.phases.length > 0) {
      // Group tickets by phase
      const sortedPhases = [...initiative.phases].sort((a, b) => a.order - b.order);
      for (const phase of sortedPhases) {
        const phaseTickets = initiativeTickets.filter((t) => t.phaseId === phase.id);
        const phaseChildren: NavigatorNode[] = phaseTickets.map((t) => ticketNode(t));

        children.push({
          id: `phase-${phase.id}`,
          type: "phase",
          label: phase.name,
          path: `/initiative/${initiative.id}?step=tickets`,
          status: phase.status,
          children: phaseChildren
        });
      }

      // Tickets not in any phase under this initiative
      const unphased = initiativeTickets.filter((t) => !t.phaseId);
      for (const t of unphased) {
        children.push(ticketNode(t));
      }
    } else {
      // Flat ticket list under initiative
      for (const t of initiativeTickets) {
        children.push(ticketNode(t));
      }
    }

    nodes.push({
      id: `initiative-${initiative.id}`,
      type: "initiative",
      label: getInitiativeDisplayTitle(initiative.title, initiative.description),
      path: initiativePath,
      status: statusDotClass(initiative.status),
      children
    });
  }

  // Quick Tasks section
  const quickTasks = tickets.filter((t) => !t.initiativeId);
  if (quickTasks.length > 0) {
    nodes.push({
      id: "quick-tasks-header",
      type: "quick-tasks-header",
      label: "Quick Tasks",
      path: "/#quick-tasks",
      children: quickTasks.map((t) => ticketNode(t))
    });
  }

  return nodes;
};

const ticketNode = (t: Ticket): NavigatorNode => ({
  id: `ticket-${t.id}`,
  type: t.initiativeId ? "ticket" : "quick-task",
  label: t.title,
  path: `/ticket/${t.id}`,
  ticketStatus: t.status
});

// Returns node IDs that must be expanded to reveal the active path
export const computeAutoExpansion = (tree: NavigatorNode[], pathname: string): Set<string> => {
  const toExpand = new Set<string>();

  const walk = (nodes: NavigatorNode[], ancestors: string[]): boolean => {
    for (const node of nodes) {
      if (node.path === pathname || pathname.startsWith(node.path + "/")) {
        for (const a of ancestors) toExpand.add(a);
        return true;
      }
      if (node.children) {
        if (walk(node.children, [...ancestors, node.id])) {
          return true;
        }
      }
    }
    return false;
  };

  walk(tree, []);
  return toExpand;
};

// Returns the tree node ID matching the current route
export const findActiveNodeId = (tree: NavigatorNode[], pathname: string): string | null => {
  const walk = (nodes: NavigatorNode[]): string | null => {
    for (const node of nodes) {
      if (node.path === pathname) return node.id;
      if (node.children) {
        const found = walk(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Exact match first
  const exact = walk(tree);
  if (exact) return exact;

  // Longest prefix match (for nested paths like /initiative/:id)
  let best: string | null = null;
  let bestLen = 0;

  const walkPrefix = (nodes: NavigatorNode[]): void => {
    for (const node of nodes) {
      if (pathname.startsWith(node.path) && node.path.length > bestLen) {
        best = node.id;
        bestLen = node.path.length;
      }
      if (node.children) walkPrefix(node.children);
    }
  };

  walkPrefix(tree);
  return best;
};

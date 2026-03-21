import type { ArtifactsSnapshot, Initiative, Ticket, TicketStatus } from "../../types.js";
import { getInitiativeProgressModel, getInitiativeShellHref } from "../utils/initiative-progress.js";
import { getInitiativeDisplayTitle } from "../utils/initiative-titles.js";
import { getInitiativeTickets } from "../utils/snapshot-index.js";

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

const ticketNode = (ticket: Ticket): NavigatorNode => ({
  id: `ticket-${ticket.id}`,
  type: ticket.initiativeId ? "ticket" : "quick-task",
  label: ticket.title,
  path: `/ticket/${ticket.id}`,
  ticketStatus: ticket.status,
});

const initiativeNode = (
  initiative: Initiative,
  snapshot: ArtifactsSnapshot,
): NavigatorNode => {
  const initiativeTickets = getInitiativeTickets(snapshot, initiative.id);
  const initiativeProgress = getInitiativeProgressModel(initiative, snapshot);
  const initiativePath = getInitiativeShellHref(initiative, initiativeProgress, snapshot);
  const children: NavigatorNode[] = [];

  if (initiative.phases.length > 0) {
    const sortedPhases = [...initiative.phases].sort((left, right) => left.order - right.order);
    for (const phase of sortedPhases) {
      const phaseTickets = initiativeTickets.filter((ticket) => ticket.phaseId === phase.id);
      children.push({
        id: `phase-${phase.id}`,
        type: "phase",
        label: phase.name,
        path: `/initiative/${initiative.id}?step=tickets`,
        status: phase.status,
        children: phaseTickets.map((ticket) => ticketNode(ticket)),
      });
    }

    const unphasedTickets = initiativeTickets.filter((ticket) => !ticket.phaseId);
    for (const ticket of unphasedTickets) {
      children.push(ticketNode(ticket));
    }
  } else {
    for (const ticket of initiativeTickets) {
      children.push(ticketNode(ticket));
    }
  }

  return {
    id: `initiative-${initiative.id}`,
    type: "initiative",
    label: getInitiativeDisplayTitle(initiative.title, initiative.description),
    path: initiativePath,
    status: statusDotClass(initiative.status),
    children,
  };
};

export const buildNavigatorTree = (snapshot: ArtifactsSnapshot): NavigatorNode[] => {
  const { initiatives, tickets } = snapshot;
  const nodes: NavigatorNode[] = [];
  const initiativeNodes = initiatives.map((initiative) => initiativeNode(initiative, snapshot));

  if (initiativeNodes.length > 0) {
    nodes.push({
      id: "initiatives-header",
      type: "section-header",
      label: "Projects",
      path: "/",
      children: initiativeNodes,
    });
  }

  // Quick Tasks section
  const quickTasks = tickets.filter((t) => !t.initiativeId);
  if (quickTasks.length > 0) {
    nodes.push({
      id: "quick-tasks-header",
      type: "quick-tasks-header",
      label: "Quick tasks",
      path: "/#quick-tasks",
      children: quickTasks.map((t) => ticketNode(t))
    });
  }

  return nodes;
};

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

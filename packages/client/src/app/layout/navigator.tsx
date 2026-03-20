import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot, Ticket } from "../../types.js";
import { useTreeNavigation } from "../hooks/use-tree-navigation.js";
import {
  buildNavigatorTree,
  computeAutoExpansion,
  findActiveNodeId,
  type NavigatorNode,
} from "./navigator-tree.js";

interface NavigatorProps {
  snapshot: ArtifactsSnapshot;
}

const STATUS_DOT: Record<string, string> = {
  active: "var(--accent)",
  done: "var(--success)",
  draft: "var(--muted)",
  complete: "var(--success)",
};

const TICKET_DOT: Record<string, string> = {
  backlog: "var(--muted)",
  ready: "var(--accent)",
  "in-progress": "var(--warning)",
  verify: "var(--accent)",
  done: "var(--success)",
};

interface TreeItemProps {
  node: NavigatorNode;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
  activeNodeId: string | null;
  onToggle: (id: string) => void;
  onNavigate: (path: string) => void;
  focusedId: string | null;
  setFocusedId: (id: string) => void;
  flatList: NavigatorNode[];
  manualExpanded: Set<string>;
  autoExpanded: Set<string>;
}

const TreeItem = ({
  node,
  depth,
  isExpanded,
  isActive,
  activeNodeId,
  onToggle,
  onNavigate,
  focusedId,
  setFocusedId,
  flatList,
  manualExpanded,
  autoExpanded,
}: TreeItemProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const hasChildren = node.children && node.children.length > 0;
  const dotColor =
    node.ticketStatus
      ? TICKET_DOT[node.ticketStatus] ?? "var(--muted)"
      : node.status
        ? STATUS_DOT[node.status] ?? "var(--muted)"
        : null;

  useEffect(() => {
    if (focusedId === node.id) ref.current?.focus();
  }, [focusedId, node.id]);

  const handleKeyDown = useTreeNavigation(
    node.id,
    flatList,
    { onNavigate, onToggle, setFocusedId },
    { isExpanded, hasChildren: !!hasChildren, children: node.children, path: node.path },
  );

  const isHeader = node.type === "quick-tasks-header" || node.type === "section-header";
  const indentPx = depth * 14;
  const isClickable = !isHeader;

  return (
    <>
      <div
        ref={ref}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={focusedId === node.id ? 0 : -1}
        className={`nav-tree-item${isActive ? " active" : ""}${isHeader ? " nav-tree-header" : ""}`}
        style={{ paddingLeft: `${0.7 + indentPx / 16}rem` }}
        onClick={() => {
          setFocusedId(node.id);
          if (hasChildren) onToggle(node.id);
          if (isClickable) {
            onNavigate(node.path);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="nav-tree-chevron" style={{ visibility: hasChildren ? "visible" : "hidden" }}>
          {isExpanded ? "▾" : "▸"}
        </span>
        {dotColor ? <span className="nav-tree-dot" style={{ background: dotColor }} aria-hidden="true" /> : null}
        <span className="nav-tree-label" title={node.label}>
          {node.label}
        </span>
      </div>
      {hasChildren && isExpanded && node.children ? (
        <div role="group">
          {node.children.map((child) => {
            const childExpanded = manualExpanded.has(child.id) || autoExpanded.has(child.id);
            return (
              <TreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                isExpanded={childExpanded}
                isActive={activeNodeId === child.id}
                activeNodeId={activeNodeId}
                onToggle={onToggle}
                onNavigate={onNavigate}
                focusedId={focusedId}
                setFocusedId={setFocusedId}
                flatList={flatList}
                manualExpanded={manualExpanded}
                autoExpanded={autoExpanded}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
};

const flattenVisible = (nodes: NavigatorNode[], expanded: Set<string>): NavigatorNode[] => {
  const result: NavigatorNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && expanded.has(node.id)) {
      result.push(...flattenVisible(node.children, expanded));
    }
  }
  return result;
};

const getActiveInitiativeId = (snapshot: ArtifactsSnapshot, pathname: string): string | null => {
  const ticketForPath = (ticketId: string | null | undefined): Ticket | undefined =>
    snapshot.tickets.find((ticket) => ticket.id === ticketId);

  if (pathname.startsWith("/initiative/")) {
    return pathname.split("/")[2] ?? null;
  }

  if (pathname.startsWith("/ticket/")) {
    return ticketForPath(pathname.split("/")[2])?.initiativeId ?? null;
  }

  if (pathname.startsWith("/run/")) {
    const runId = pathname.split("/")[2];
    const run = snapshot.runs.find((candidate) => candidate.id === runId);
    return ticketForPath(run?.ticketId)?.initiativeId ?? null;
  }

  return null;
};

const getActiveTicketId = (snapshot: ArtifactsSnapshot, pathname: string): string | null => {
  if (pathname.startsWith("/ticket/")) {
    return pathname.split("/")[2] ?? null;
  }

  if (pathname.startsWith("/run/")) {
    const runId = pathname.split("/")[2];
    const run = snapshot.runs.find((candidate) => candidate.id === runId);
    return run?.ticketId ?? null;
  }

  return null;
};

export const Navigator = ({ snapshot }: NavigatorProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const activeRoute = `${location.pathname}${location.search}`;

  const tree = useMemo(() => buildNavigatorTree(snapshot), [snapshot]);
  const activeInitiativeId = useMemo(
    () => getActiveInitiativeId(snapshot, location.pathname),
    [location.pathname, snapshot],
  );
  const activeTicketId = useMemo(
    () => getActiveTicketId(snapshot, location.pathname),
    [location.pathname, snapshot],
  );
  const contentNodes = useMemo(() => tree, [tree]);

  const autoExpanded = useMemo(() => {
    const expanded = computeAutoExpansion(contentNodes, activeRoute);
    if (activeInitiativeId) {
      expanded.add(`initiative-${activeInitiativeId}`);
    }
    return expanded;
  }, [activeInitiativeId, activeRoute, contentNodes]);
  const allExpanded = useMemo(() => {
    const combined = new Set(manualExpanded);
    for (const id of autoExpanded) combined.add(id);
    return combined;
  }, [manualExpanded, autoExpanded]);
  const flatList = useMemo(() => flattenVisible(contentNodes, allExpanded), [contentNodes, allExpanded]);
  const activeNodeId = useMemo(() => {
    const matchedNodeId = findActiveNodeId(contentNodes, activeRoute);
    if (
      matchedNodeId &&
      matchedNodeId !== "initiatives-header" &&
      matchedNodeId !== "quick-tasks-header" &&
      !matchedNodeId.startsWith("phase-")
    ) {
      return matchedNodeId;
    }

    if (activeTicketId) {
      return `ticket-${activeTicketId}`;
    }

    return activeInitiativeId ? `initiative-${activeInitiativeId}` : null;
  }, [activeInitiativeId, activeRoute, activeTicketId, contentNodes]);

  const handleToggle = useCallback((id: string) => {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const renderItem = (node: NavigatorNode) => {
    const expanded = allExpanded.has(node.id);
    const isActive = activeNodeId === node.id;

    return (
      <TreeItem
        key={node.id}
        node={node}
        depth={0}
        isExpanded={expanded}
        isActive={isActive}
        activeNodeId={activeNodeId}
        onToggle={handleToggle}
        onNavigate={handleNavigate}
        focusedId={focusedId}
        setFocusedId={setFocusedId}
        flatList={flatList}
        manualExpanded={manualExpanded}
        autoExpanded={autoExpanded}
      />
    );
  };

  return (
    <div className="navigator">
      {contentNodes.length > 0 ? (
        <div role="tree" aria-label="Project navigator" className="navigator-tree">
          {contentNodes.map(renderItem)}
        </div>
      ) : null}
    </div>
  );
};

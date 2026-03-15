import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import { useTreeNavigation } from "../hooks/use-tree-navigation.js";
import {
  buildNavigatorTree,
  computeAutoExpansion,
  findActiveNodeId,
  type NavigatorNode
} from "./navigator-tree.js";

interface NavigatorProps {
  snapshot: ArtifactsSnapshot;
}

// Covers both initiative statuses (draft/active/done) and phase statuses (active/complete)
const STATUS_DOT: Record<string, string> = {
  active: "var(--accent)",
  done: "var(--success)",
  draft: "var(--muted)",
  complete: "var(--success)"
};

const TICKET_DOT: Record<string, string> = {
  backlog: "var(--muted)",
  ready: "var(--accent)",
  "in-progress": "var(--warning)",
  verify: "var(--accent)",
  done: "var(--success)"
};

interface TreeItemProps {
  node: NavigatorNode;
  depth: number;
  isExpanded: boolean;
  isActive: boolean;
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
    { isExpanded, hasChildren: !!hasChildren, children: node.children, path: node.path }
  );

  const isHeader = node.type === "quick-tasks-header";
  const isAggregateLink = node.type === "aggregate-link";
  const indentPx = depth * 14;

  return (
    <>
      <div
        ref={ref}
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={focusedId === node.id ? 0 : -1}
        className={`nav-tree-item${isActive ? " active" : ""}${isHeader ? " nav-tree-header" : ""}${isAggregateLink ? " nav-tree-aggregate" : ""}`}
        style={{ paddingLeft: `${0.7 + indentPx / 16}rem` }}
        onClick={() => {
          setFocusedId(node.id);
          if (hasChildren) onToggle(node.id);
          onNavigate(node.path);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="nav-tree-chevron" style={{ visibility: hasChildren ? "visible" : "hidden" }}>
          {isExpanded ? "▾" : "▸"}
        </span>
        {dotColor && (
          <span
            className="nav-tree-dot"
            style={{ background: dotColor }}
            aria-hidden="true"
          />
        )}
        <span className="nav-tree-label" title={node.label}>{node.label}</span>
      </div>
      {hasChildren && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => {
            const childExpanded = manualExpanded.has(child.id) || autoExpanded.has(child.id);
            return (
              <TreeItem
                key={child.id}
                node={child}
                depth={depth + 1}
                isExpanded={childExpanded}
                isActive={false}
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
      )}
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

export const Navigator = ({ snapshot }: NavigatorProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const tree = useMemo(() => buildNavigatorTree(snapshot), [snapshot]);

  const autoExpanded = useMemo(
    () => computeAutoExpansion(tree, location.pathname),
    [tree, location.pathname]
  );

  const activeNodeId = useMemo(
    () => findActiveNodeId(tree, location.pathname),
    [tree, location.pathname]
  );

  const allExpanded = useMemo(() => {
    const combined = new Set(manualExpanded);
    for (const id of autoExpanded) combined.add(id);
    return combined;
  }, [manualExpanded, autoExpanded]);

  const flatList = useMemo(() => flattenVisible(tree, allExpanded), [tree, allExpanded]);

  const filteredTree = useMemo(() => {
    if (!filterText.trim()) return tree;
    const q = filterText.toLowerCase();
    const filterNodes = (nodes: NavigatorNode[]): NavigatorNode[] =>
      nodes.flatMap((n) => {
        if (n.label.toLowerCase().includes(q)) return [n];
        const filteredChildren = n.children ? filterNodes(n.children) : [];
        if (filteredChildren.length > 0) return [{ ...n, children: filteredChildren }];
        return [];
      });
    return filterNodes(tree);
  }, [tree, filterText]);

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
    [navigate]
  );

  const displayTree = filterText.trim() ? filteredTree : tree;
  const displayFlatList = filterText.trim()
    ? flattenVisible(filteredTree, new Set(filteredTree.map((n) => n.id)))
    : flatList;

  const aggregateNodes = displayTree.filter((n) => n.type === "aggregate-link");
  const contentNodes = displayTree.filter((n) => n.type !== "aggregate-link");

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
        onToggle={handleToggle}
        onNavigate={handleNavigate}
        focusedId={focusedId}
        setFocusedId={setFocusedId}
        flatList={displayFlatList}
        manualExpanded={manualExpanded}
        autoExpanded={autoExpanded}
      />
    );
  };

  return (
    <div className="navigator">
      <div className="navigator-brand">
        <div className="brand-mark">SF</div>
        <div>
          <div className="navigator-brand-name">SpecFlow</div>
        </div>
      </div>

      <div className="navigator-filter">
        <div className="navigator-filter-wrap">
          <input
            type="text"
            placeholder="Filter"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="navigator-filter-input"
            aria-label="Filter navigator"
            style={filterText ? { paddingRight: "1.8rem" } : undefined}
          />
          {filterText && (
            <button
              type="button"
              className="navigator-filter-clear"
              onClick={() => setFilterText("")}
              aria-label="Clear filter"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="navigator-actions">
        <button
          type="button"
          className="btn-primary navigator-new-button"
          onClick={() => navigate("/new-initiative")}
        >
          + New
        </button>
      </div>

      <div role="tree" aria-label="Project navigator" className="navigator-tree">
        {aggregateNodes.length > 0 && (
          <>
            {aggregateNodes.map(renderItem)}
            {contentNodes.length > 0 && <div className="nav-tree-divider" />}
          </>
        )}
        {contentNodes.map(renderItem)}
      </div>

      <div className="navigator-footer">
        <button
          className="navigator-settings-button"
          onClick={() => navigate("/settings")}
          type="button"
          aria-label="Settings"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M6.8 1.5h2.4l.35 1.7a5 5 0 0 1 1.2.7l1.65-.55.95 1.65-1.3 1.15a5 5 0 0 1 0 1.4l1.3 1.15-.95 1.65-1.65-.55a5 5 0 0 1-1.2.7l-.35 1.7H6.8l-.35-1.7a5 5 0 0 1-1.2-.7l-1.65.55-.95-1.65 1.3-1.15a5 5 0 0 1 0-1.4L2.65 5.05l.95-1.65 1.65.55a5 5 0 0 1 1.2-.7l.35-1.7Z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

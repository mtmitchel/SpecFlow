import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import {
  buildNavigatorTree,
  computeAutoExpansion,
  findActiveNodeId,
  type NavigatorNode
} from "./navigator-tree.js";

interface NavigatorProps {
  snapshot: ArtifactsSnapshot;
  onOpenCommandPalette: () => void;
}

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
  snapshot: ArtifactsSnapshot;
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
  autoExpanded
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = flatList.findIndex((n) => n.id === node.id);
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        onNavigate(node.path);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (hasChildren && !isExpanded) {
          onToggle(node.id);
        } else if (hasChildren && isExpanded && node.children?.[0]) {
          setFocusedId(node.children[0].id);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (hasChildren && isExpanded) {
          onToggle(node.id);
        }
        break;
      case "ArrowDown": {
        e.preventDefault();
        const next = flatList[currentIndex + 1];
        if (next) setFocusedId(next.id);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = flatList[currentIndex - 1];
        if (prev) setFocusedId(prev.id);
        break;
      }
      case "Home":
        e.preventDefault();
        if (flatList[0]) setFocusedId(flatList[0].id);
        break;
      case "End":
        e.preventDefault();
        if (flatList[flatList.length - 1]) setFocusedId(flatList[flatList.length - 1].id);
        break;
    }
  };

  const isHeader = node.type === "quick-tasks-header";
  const indentPx = depth * 14;

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
        <span className="nav-tree-label">{node.label}</span>
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
                snapshot={{} as ArtifactsSnapshot}
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

export const Navigator = ({ snapshot, onOpenCommandPalette }: NavigatorProps) => {
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

  return (
    <div className="navigator">
      <div className="navigator-brand">
        <div className="brand-mark">SF</div>
        <div>
          <div className="navigator-brand-name">SpecFlow</div>
        </div>
      </div>

      <div className="navigator-filter">
        <input
          type="text"
          placeholder="Filter..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="navigator-filter-input"
          aria-label="Filter navigator"
        />
      </div>

      <div role="tree" aria-label="Project navigator" className="navigator-tree">
        {displayTree.map((node) => {
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
              snapshot={snapshot}
              manualExpanded={manualExpanded}
              autoExpanded={autoExpanded}
            />
          );
        })}
      </div>

      <button
        className="navigator-new-button"
        onClick={onOpenCommandPalette}
        type="button"
      >
        + New
      </button>
    </div>
  );
};

import type { NavigatorNode } from "../layout/navigator-tree.js";

interface TreeNavigationHandlers {
  onNavigate: (path: string) => void;
  onToggle: (id: string) => void;
  setFocusedId: (id: string) => void;
}

interface TreeNavigationState {
  isExpanded: boolean;
  hasChildren: boolean;
  children: NavigatorNode[] | undefined;
  path: string;
}

export const useTreeNavigation = (
  nodeId: string,
  flatList: NavigatorNode[],
  handlers: TreeNavigationHandlers,
  state: TreeNavigationState
): ((e: React.KeyboardEvent) => void) => {
  return (e: React.KeyboardEvent) => {
    const currentIndex = flatList.findIndex((n) => n.id === nodeId);
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        handlers.onNavigate(state.path);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (state.hasChildren && !state.isExpanded) {
          handlers.onToggle(nodeId);
        } else if (state.hasChildren && state.isExpanded && state.children?.[0]) {
          handlers.setFocusedId(state.children[0].id);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (state.hasChildren && state.isExpanded) {
          handlers.onToggle(nodeId);
        }
        break;
      case "ArrowDown": {
        e.preventDefault();
        const next = flatList[currentIndex + 1];
        if (next) handlers.setFocusedId(next.id);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = flatList[currentIndex - 1];
        if (prev) handlers.setFocusedId(prev.id);
        break;
      }
      case "Home":
        e.preventDefault();
        if (flatList[0]) handlers.setFocusedId(flatList[0].id);
        break;
      case "End":
        e.preventDefault();
        if (flatList[flatList.length - 1]) handlers.setFocusedId(flatList[flatList.length - 1].id);
        break;
    }
  };
};

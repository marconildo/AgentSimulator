// 056-ragless-pageindex — the pure projection behind the anchored RAGLESS panel.
// `derivePageIndexPipeline` turns the event log up to the cursor into the ordered
// reasoning-retrieval stages and each one's live status, so the panel just renders
// descriptors (no logic) and live streaming / step-replay share the exact same code
// path as the rest of the canvas (a smaller cursor = replay).
//
// The PageIndex pipeline is Document tree → Navigate → Select → Augmented. There is
// NO embedding / vector-search / rerank — retrieval is by reasoning over a tree, not
// cosine similarity. "Augmented" is the "A": the selected sections assembled into the
// prompt context handed to the LLM (read from `llm.prompt`, like the RAG pipeline's).

import type { ContextBudget, Stage, TraceEvent } from "../types/events";

export type PageIndexStageId = "tree" | "navigate" | "select" | "augmented";

// pending — part of this run but not reached yet
// active  — firing right now (the cursor is on one of its events)
// done    — completed (its END event has passed)
export type PageIndexStageStatus = "pending" | "active" | "done";

export interface PageIndexStage {
  id: PageIndexStageId;
  status: PageIndexStageStatus;
  data: Record<string, unknown>;
}

export interface PageIndexPipeline {
  stages: PageIndexStage[];
  /** True once the RAGLESS path has actually run this turn. */
  started: boolean;
}

export const PAGEINDEX_STAGE_ORDER: PageIndexStageId[] = [
  "tree",
  "navigate",
  "select",
  "augmented",
];

// A selected section as the panel consumes it (mirror of the backend chunk dict).
export interface SelectedSection {
  source: string;
  title?: string;
  text: string;
  node_id?: string;
  rank?: number;
}

// One node of the serialized document tree (mirror of TreeNode.to_dict()).
export interface TreeNodeView {
  id: string;
  title: string;
  level: number;
  source: string;
  snippet?: string;
  children?: TreeNodeView[];
}

// A node the navigation landed on (resolved from a selected id against the tree),
// so the Navigate drill-in can show *where* in the tree the LLM reasoned to.
export interface NavigatedNode {
  id: string;
  title: string;
  source: string;
}

/** Resolve selected node ids against the tree → the nodes (in tree order). */
export function findNodes(tree: TreeNodeView, ids: string[]): NavigatedNode[] {
  const want = new Set(ids);
  const out: NavigatedNode[] = [];
  const walk = (n: TreeNodeView): void => {
    for (const child of n.children ?? []) {
      if (want.has(child.id)) out.push({ id: child.id, title: child.title, source: child.source });
      walk(child);
    }
  };
  walk(tree);
  return out;
}

export function derivePageIndexPipeline(
  events: TraceEvent[],
  cursor: number,
): PageIndexPipeline {
  const visible = cursor >= 0 ? events.slice(0, cursor + 1) : [];

  const lastEnd = (stage: Stage): TraceEvent | undefined => {
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].stage === stage && visible[i].phase === "end") return visible[i];
    }
    return undefined;
  };
  const present = (stage: Stage): boolean => visible.some((e) => e.stage === stage);

  const status = (stage: Stage): PageIndexStageStatus => {
    if (lastEnd(stage)) return "done";
    if (present(stage)) return "active";
    return "pending";
  };

  // 1 — Document tree: the corpus' table of contents the model will navigate.
  const tree = lastEnd("pageindex.tree");
  const treeStage: PageIndexStage = {
    id: "tree",
    status: status("pageindex.tree"),
    data: tree
      ? {
          tree: tree.data.tree,
          nodes: tree.data.nodes,
          files: tree.data.files,
          leaves: tree.data.leaves,
        }
      : {},
  };

  // 2 — Navigate: the LLM reasons over the tree and picks node id(s). The reasoning
  // trace is the explainable "why this passage?" — not a cosine score. We resolve the
  // selected ids back against the tree (from the tree stage) so the drill-in can show
  // WHERE the navigation landed — the chosen nodes + the path highlighted in the tree.
  const nav = lastEnd("pageindex.navigate");
  const treeForNav = (tree?.data.tree as TreeNodeView | undefined) ?? undefined;
  const selectedIds = (nav?.data.selected as string[]) ?? [];
  const navigate: PageIndexStage = {
    id: "navigate",
    status: status("pageindex.navigate"),
    data: nav
      ? {
          model: nav.data.model,
          query: nav.data.query,
          reasoning: nav.data.reasoning,
          selected: selectedIds,
          tree: treeForNav,
          navigatedNodes: treeForNav ? findNodes(treeForNav, selectedIds) : [],
        }
      : {},
  };

  // 3 — Select: the chosen sections whose text becomes the grounding context.
  const select = lastEnd("pageindex.select");
  const selectStage: PageIndexStage = {
    id: "select",
    status: status("pageindex.select"),
    data: select
      ? {
          chunks: (select.data.chunks as SelectedSection[]) ?? [],
          count: select.data.count,
          reasoning: select.data.reasoning,
        }
      : {},
  };

  // 4 — Augmented: the selected context assembled into the prompt sent to the LLM
  // (the "A" in RAG), read from the llm.prompt budget's `retrieved` slice.
  const prompt = lastEnd("llm.prompt");
  const budget = prompt?.data.context_budget as ContextBudget | undefined;
  const augmented: PageIndexStage = {
    id: "augmented",
    status: status("llm.prompt"),
    data: prompt
      ? {
          retrievedTokens: budget?.retrieved,
          context: prompt.data.context,
          window: prompt.data.context_window,
        }
      : {},
  };

  const started =
    present("pageindex.tree") || present("pageindex.navigate") || present("pageindex.select");

  return { stages: [treeStage, navigate, selectStage, augmented], started };
}

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useMemo } from "react";

import { SECTIONS } from "./content";
import { RootNode, SectionNode, TopicNode } from "./LearnNodes";

const nodeTypes = { lroot: RootNode, lsection: SectionNode, ltopic: TopicNode };

const COL_STEP = 268;
const SECTION_Y = 120;
const TOPIC_START_Y = 224;
const TOPIC_STEP = 78;

interface LearnMapProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function LearnMap({ selected, onSelect }: LearnMapProps) {
  const { nodes, edges } = useMemo(() => buildGraph(selected), [selected]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.3}
      maxZoom={1.4}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => {
        if (node.type === "ltopic" || node.type === "lsection") onSelect(node.id);
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1b2540" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function buildGraph(selected: string | null): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const totalWidth = (SECTIONS.length - 1) * COL_STEP;

  nodes.push({
    id: "root",
    type: "lroot",
    position: { x: totalWidth / 2 - 110, y: 0 },
    data: {},
    draggable: false,
    selectable: false,
  });

  SECTIONS.forEach((section, i) => {
    const x = i * COL_STEP;
    nodes.push({
      id: section.id,
      type: "lsection",
      position: { x, y: SECTION_Y },
      data: { section },
      draggable: false,
    });
    edges.push({
      id: `root-${section.id}`,
      source: "root",
      target: section.id,
      style: { stroke: `${section.accent}88`, strokeDasharray: "4 4" },
    });

    section.topics.forEach((topic, j) => {
      nodes.push({
        id: topic.id,
        type: "ltopic",
        position: { x, y: TOPIC_START_Y + j * TOPIC_STEP },
        data: { topic, section, selected: selected === topic.id },
        draggable: false,
      });
      edges.push({
        id: `${j === 0 ? section.id : section.topics[j - 1].id}-${topic.id}`,
        source: j === 0 ? section.id : section.topics[j - 1].id,
        target: topic.id,
        style: { stroke: `${section.accent}66`, strokeDasharray: "4 4" },
      });
    });
  });

  return { nodes, edges };
}

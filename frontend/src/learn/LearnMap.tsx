import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useMemo } from "react";

import { type Lang, useLang } from "../i18n";
import { type CloudId, useCloud } from "../lib/cloud";
import { CLOUD_ACCENT } from "../lib/cloudIcons";
import { cloudGuideFor, sectionsFor, type Section } from "./content";
import { CloudSectionNode, CloudTopicNode, RootNode, SectionNode, TopicNode } from "./LearnNodes";

const nodeTypes = {
  lroot: RootNode,
  lsection: SectionNode,
  ltopic: TopicNode,
  lcloud: CloudSectionNode,
  lcloudtopic: CloudTopicNode,
};

const COL_STEP = 268;
const SECTION_Y = 120;
const TOPIC_START_Y = 224;
const TOPIC_STEP = 78;
const CLOUD_PREFIX = "cloud:";

interface LearnMapProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function LearnMap({ selected, onSelect }: LearnMapProps) {
  const lang = useLang((s) => s.lang);
  const cloud = useCloud((s) => s.cloud);
  const sections = sectionsFor(lang);
  const { nodes, edges } = useMemo(
    () => buildGraph(selected, sections, cloud, lang),
    [selected, sections, cloud, lang],
  );

  return (
    <ReactFlow
      // Remount when the cloud changes so fitView reframes to include (or drop)
      // the "Build on {cloud}" column — otherwise the new column appears off-screen.
      key={cloud}
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
        if (node.type === "lcloudtopic") onSelect(node.id.slice(CLOUD_PREFIX.length));
        else if (node.type === "ltopic" || node.type === "lsection") onSelect(node.id);
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--color-dots)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/**
 * Pure graph builder (no hooks) so it is unit-testable. When `cloud` is not
 * "generic", appends a "Build on {cloud}" column of namespaced `cloud:{topicId}`
 * nodes — each click maps back to the real topic id.
 */
export function buildGraph(
  selected: string | null,
  sections: Section[],
  cloud: CloudId,
  lang: Lang,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const guide = cloudGuideFor(cloud, lang);
  const cloudCol = guide.length > 0;
  const colCount = sections.length + (cloudCol ? 1 : 0);
  const totalWidth = (colCount - 1) * COL_STEP;

  nodes.push({
    id: "root",
    type: "lroot",
    position: { x: totalWidth / 2 - 110, y: 0 },
    data: {},
    draggable: false,
    selectable: false,
  });

  sections.forEach((section, i) => {
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
      style: {
        stroke: `color-mix(in srgb, ${section.accent} 53%, transparent)`,
        strokeDasharray: "4 4",
      },
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
        style: {
          stroke: `color-mix(in srgb, ${section.accent} 40%, transparent)`,
          strokeDasharray: "4 4",
        },
      });
    });
  });

  if (cloudCol) {
    const accent = CLOUD_ACCENT[cloud];
    const x = sections.length * COL_STEP;
    nodes.push({
      id: "cloud-col",
      type: "lcloud",
      position: { x, y: SECTION_Y },
      data: { cloud },
      draggable: false,
      selectable: false,
    });
    edges.push({
      id: "root-cloud-col",
      source: "root",
      target: "cloud-col",
      style: { stroke: `color-mix(in srgb, ${accent} 53%, transparent)`, strokeDasharray: "4 4" },
    });
    guide.forEach((entry, j) => {
      const id = `${CLOUD_PREFIX}${entry.topicId}`;
      nodes.push({
        id,
        type: "lcloudtopic",
        position: { x, y: TOPIC_START_Y + j * TOPIC_STEP },
        data: { entry, cloud },
        draggable: false,
      });
      edges.push({
        id: `${j === 0 ? "cloud-col" : `${CLOUD_PREFIX}${guide[j - 1].topicId}`}-${id}`,
        source: j === 0 ? "cloud-col" : `${CLOUD_PREFIX}${guide[j - 1].topicId}`,
        target: id,
        style: { stroke: `color-mix(in srgb, ${accent} 40%, transparent)`, strokeDasharray: "4 4" },
      });
    });
  }

  return { nodes, edges };
}

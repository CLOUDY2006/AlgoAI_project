// ─── Topic prerequisite graph ──────────────────────────────────────────────
//
// Adapted from the actual topic ids AlgoAI already uses (see
// onboarding.validator.ts's ALLOWED_TOPICS / Onboarding.tsx's `topics`).
// This is deliberately a reasonable, documented judgment call about DSA
// learning order — not an attempt at a "correct" academic ordering — and is
// meant to be easy to tweak as the real problem catalogue grows.
//
// `prerequisites` are topic ids that should be introduced before this topic.
// `subtopics` are an easy -> harder progression WITHIN the topic itself; each
// becomes one roadmap day for that topic.

export interface TopicNode {
  id: string;
  label: string;
  prerequisites: string[];
  subtopics: string[];
}

export const TOPIC_GRAPH: Record<string, TopicNode> = {
  arrays: {
    id: "arrays",
    label: "Arrays",
    prerequisites: [],
    subtopics: ["Arrays Fundamentals", "Array Traversal & Searching", "Prefix Sums & Subarrays"],
  },
  strings: {
    id: "strings",
    label: "Strings",
    prerequisites: ["arrays"],
    subtopics: ["String Basics", "String Manipulation Patterns"],
  },
  "two-pointers": {
    id: "two-pointers",
    label: "Two Pointers",
    prerequisites: ["arrays"],
    subtopics: ["Two Pointers Basics", "Two Pointers on Sorted Arrays"],
  },
  "sliding-window": {
    id: "sliding-window",
    label: "Sliding Window",
    prerequisites: ["two-pointers"],
    subtopics: ["Fixed-Size Window", "Variable-Size Window"],
  },
  hashing: {
    id: "hashing",
    label: "Hashing",
    prerequisites: ["arrays"],
    subtopics: ["Hash Map Basics", "Hashing Patterns"],
  },
  "binary-search": {
    id: "binary-search",
    label: "Binary Search",
    prerequisites: ["arrays"],
    subtopics: ["Binary Search Basics", "Binary Search on Answer"],
  },
  "linked-list": {
    id: "linked-list",
    label: "Linked List",
    prerequisites: [],
    subtopics: ["Linked List Fundamentals", "Linked List Operations & Patterns"],
  },
  stack: {
    id: "stack",
    label: "Stack",
    prerequisites: ["linked-list"],
    subtopics: ["Stack Basics", "Stack Applications"],
  },
  queue: {
    id: "queue",
    label: "Queue",
    prerequisites: ["linked-list"],
    subtopics: ["Queue Basics", "Queue Applications"],
  },
  recursion: {
    id: "recursion",
    label: "Recursion",
    prerequisites: [],
    subtopics: ["Recursion Basics", "Recursion Patterns"],
  },
  backtracking: {
    id: "backtracking",
    label: "Backtracking",
    prerequisites: ["recursion"],
    subtopics: ["Backtracking Basics", "Backtracking on Grids & Sets"],
  },
  trees: {
    id: "trees",
    label: "Trees",
    prerequisites: ["recursion", "stack", "queue"],
    subtopics: ["Tree Fundamentals", "Tree Traversal (BFS/DFS)"],
  },
  bst: {
    id: "bst",
    label: "Binary Search Tree",
    prerequisites: ["trees", "binary-search"],
    subtopics: ["BST Basics", "BST Operations"],
  },
  heaps: {
    id: "heaps",
    label: "Heaps",
    prerequisites: ["trees"],
    subtopics: ["Heap Basics", "Heap Applications"],
  },
  graphs: {
    id: "graphs",
    label: "Graphs",
    prerequisites: ["trees", "queue"],
    subtopics: ["Graph Fundamentals", "Graph Traversal (BFS/DFS)", "Shortest Path Basics"],
  },
  greedy: {
    id: "greedy",
    label: "Greedy",
    prerequisites: ["arrays"],
    subtopics: ["Greedy Basics", "Greedy Patterns"],
  },
  dp: {
    id: "dp",
    label: "Dynamic Programming",
    prerequisites: ["recursion"],
    subtopics: ["DP Fundamentals (1D)", "DP Patterns (2D)"],
  },
  trie: {
    id: "trie",
    label: "Trie",
    prerequisites: ["strings", "trees"],
    subtopics: ["Trie Basics", "Trie Applications"],
  },
  "bit-manipulation": {
    id: "bit-manipulation",
    label: "Bit Manipulation",
    prerequisites: [],
    subtopics: ["Bit Basics", "Bit Tricks"],
  },
};

/**
 * Builds a prerequisite-respecting topic order, prioritized by the user's
 * preferred topics — pulling in any missing prerequisites just before the
 * topic that needs them, and leaving already-covered topics deduplicated.
 * This is what stops "Day 1 = Array, Day 2 = Linked List, Day 3 = Graph"
 * (the exact bug this task is meant to fix): a preferred topic like "graphs"
 * pulls in trees/queue/recursion first, in the right order.
 */
export const buildTopicOrder = (preferredTopics: string[]): string[] => {
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (topicId: string) => {
    if (visited.has(topicId) || !TOPIC_GRAPH[topicId]) return;
    visited.add(topicId);
    TOPIC_GRAPH[topicId].prerequisites.forEach(visit);
    order.push(topicId);
  };

  preferredTopics.forEach(visit);

  // Fill in any remaining topics (from the full graph) afterward, in their
  // own prerequisite order, so the roadmap has somewhere to go once the
  // user's stated interests are covered.
  Object.keys(TOPIC_GRAPH).forEach(visit);

  return order;
};
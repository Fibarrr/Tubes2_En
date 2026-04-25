using System;
using System.Collections.Generic;

namespace MyApplication {

    public record TraversalStep(
        string NodeId,
        string Tag,
        int    Depth,
        bool   IsMatch,
        string StepType
    );

    public class DomTraverser {
        private readonly TreeNode    _root;
        private readonly CssSelector _selector;

        public DomTraverser(TreeNode root, CssSelector selector) {
            _root     = root;
            _selector = selector;
        }

        // BFS 

        public (List<TraversalStep> Steps, List<string> MatchedIds) BFS(int limit = 0) {
            var steps   = new List<TraversalStep>();
            var matched = new List<string>();

            var queue = new Queue<TreeNode>();
            queue.Enqueue(_root);

            while (queue.Count > 0) {
                var node    = queue.Dequeue();
                bool isMatch = _selector.Matches(node);

                steps.Add(new TraversalStep(
                    node.NodeId, node.Tag, node.Depth,
                    isMatch, isMatch ? "match" : "visit"
                ));

                if (isMatch) {
                    matched.Add(node.NodeId);

                    // Early stop pas sudah mencapai batas Top N
                    if (limit > 0 && matched.Count >= limit)
                        break;
                }

                foreach (var child in node.Children)
                    queue.Enqueue(child);
            }

            return (steps, matched);
        }

        // DFS

        public (List<TraversalStep> Steps, List<string> MatchedIds) DFS(int limit = 0) {
            var steps   = new List<TraversalStep>();
            var matched = new List<string>();

            var stack = new Stack<TreeNode>();
            stack.Push(_root);

            while (stack.Count > 0) {
                var node     = stack.Pop();
                bool isMatch = _selector.Matches(node);

                steps.Add(new TraversalStep(
                    node.NodeId, node.Tag, node.Depth,
                    isMatch, isMatch ? "match" : "visit"
                ));

                if (isMatch) {
                    matched.Add(node.NodeId);

                    // Early stop pas sudah mencapai batas Top N
                    if (limit > 0 && matched.Count >= limit)
                        break;
                }

                // Push terbalik agar child kiri diproses pertama
                for (int i = node.Children.Count - 1; i >= 0; i--)
                    stack.Push(node.Children[i]);
            }

            return (steps, matched);
        }
    }
}
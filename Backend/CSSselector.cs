using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace MyApplication {

    public class CssSelector {
        private record SimpleSelector(
            string? Tag,
            List<string> Classes,
            string? Id,
            List<AttrSelector> Attrs,
            bool IsUniversal
        );

        private record AttrSelector(string Name, string Op, string Value);

        private record SelectorPart(SimpleSelector Simple, string Combinator);

        private readonly List<SelectorPart> _parts;
        public string Raw { get; }

        public CssSelector(string selector) {
            Raw = selector.Trim();
            _parts = Parse(Raw);
        }

        // Public API 

        public bool Matches(TreeNode node) {
            if (_parts.Count == 0) return false;
            return MatchFromRight(node, _parts.Count - 1);
        }

        // Matching

        private bool MatchFromRight(TreeNode node, int partIndex) {
            var part = _parts[partIndex];
            if (!MatchSimple(node, part.Simple)) return false;
            if (partIndex == 0) return true;

            string combinator = _parts[partIndex].Combinator;
            switch (combinator) {
                case ">":
                    if (node.Parent == null) return false;
                    return MatchFromRight(node.Parent, partIndex - 1);

                case " ":
                    TreeNode? ancestor = node.Parent;
                    while (ancestor != null) {
                        if (MatchFromRight(ancestor, partIndex - 1)) return true;
                        ancestor = ancestor.Parent;
                    }
                    return false;

                case "+":
                    if (node.Parent == null) return false;
                    var siblings = node.Parent.Children;
                    int idx = siblings.IndexOf(node);
                    if (idx <= 0) return false;
                    return MatchFromRight(siblings[idx - 1], partIndex - 1);

                case "~":
                    if (node.Parent == null) return false;
                    var sibs = node.Parent.Children;
                    int myIdx = sibs.IndexOf(node);
                    for (int i = 0; i < myIdx; i++)
                        if (MatchFromRight(sibs[i], partIndex - 1)) return true;
                    return false;

                default:
                    return false;
            }
        }

        private static bool MatchSimple(TreeNode node, SimpleSelector s) {
            if (!s.IsUniversal && s.Tag != null &&
                !node.Tag.Equals(s.Tag, StringComparison.OrdinalIgnoreCase))
                return false;

            foreach (var cls in s.Classes)
                if (!node.Classes.Contains(cls, StringComparer.OrdinalIgnoreCase))
                    return false;

            if (s.Id != null) {
                var nodeId = node.HtmlId;
                if (nodeId == null || !nodeId.Equals(s.Id, StringComparison.OrdinalIgnoreCase))
                    return false;
            }

            foreach (var attr in s.Attrs) {
                if (!node.Attributes.TryGetValue(attr.Name, out var attrVal))
                    return false;
                if (!MatchAttrOp(attrVal, attr.Op, attr.Value))
                    return false;
            }

            return true;
        }

        private static bool MatchAttrOp(string attrVal, string op, string expected) {
            return op switch {
                ""   => true,
                "="  => attrVal == expected,
                "~=" => Array.Exists(attrVal.Split(' '), x => x == expected),
                "^=" => attrVal.StartsWith(expected),
                "$=" => attrVal.EndsWith(expected),
                "*=" => attrVal.Contains(expected),
                "|=" => attrVal == expected || attrVal.StartsWith(expected + "-"),
                _    => false
            };
        }

        // Parser 

        private static List<SelectorPart> Parse(string selector) {
            var parts = new List<SelectorPart>();
            string combinator = " ";
            int i = 0;

            while (i < selector.Length) {
                if (selector[i] == ' ') {
                    int j = i;
                    while (j < selector.Length && selector[j] == ' ') j++;
                    if (j < selector.Length && (selector[j] == '>' || selector[j] == '+' || selector[j] == '~')) {
                        combinator = selector[j].ToString();
                        i = j + 1;
                        while (i < selector.Length && selector[i] == ' ') i++;
                    }
                    else {
                        combinator = " ";
                        i = j;
                    }
                    continue;
                }

                if (selector[i] == '>' || selector[i] == '+' || selector[i] == '~') {
                    combinator = selector[i].ToString();
                    i++;
                    while (i < selector.Length && selector[i] == ' ') i++;
                    continue;
                }

                var (simple, consumed) = ParseSimple(selector, i);
                parts.Add(new SelectorPart(simple, combinator));
                i += consumed;
                combinator = " ";
            }

            return parts;
        }

        private static (SimpleSelector, int) ParseSimple(string s, int start) {
            string? tag = null;
            bool isUniversal = false;
            var classes = new List<string>();
            string? id = null;
            var attrs = new List<AttrSelector>();

            int i = start;
            int consumed = 0;

            while (i < s.Length) {
                char c = s[i];

                if (c == '*') {
                    isUniversal = true;
                    i++; consumed++;
                }
                else if (c == '.') {
                    i++; consumed++;
                    string cls = ReadIdent(s, ref i, ref consumed);
                    classes.Add(cls);
                }
                else if (c == '#') {
                    i++; consumed++;
                    id = ReadIdent(s, ref i, ref consumed);
                }
                else if (c == '[') {
                    i++; consumed++;
                    int end = s.IndexOf(']', i);
                    if (end < 0) break;
                    string attrStr = s.Substring(i, end - i);
                    consumed += (end - i) + 1;
                    i = end + 1;
                    attrs.Add(ParseAttrSelector(attrStr));
                }
                else if (c == ' ' || c == '>' || c == '+' || c == '~') {
                    break;
                }
                else {
                    tag = ReadIdent(s, ref i, ref consumed).ToLower();
                }
            }

            if (!isUniversal && tag == null && classes.Count == 0 && id == null && attrs.Count == 0)
                isUniversal = true;

            return (new SimpleSelector(tag, classes, id, attrs, isUniversal), consumed);
        }

        private static string ReadIdent(string s, ref int i, ref int consumed) {
            int start = i;
            while (i < s.Length && s[i] != '.' && s[i] != '#' && s[i] != '[' &&
                   s[i] != ' ' && s[i] != '>' && s[i] != '+' && s[i] != '~' &&
                   s[i] != ']' && s[i] != ':') {
                i++; consumed++;
            }
            return s.Substring(start, i - start);
        }

        private static AttrSelector ParseAttrSelector(string s) {
            var match = Regex.Match(s.Trim(), @"^([\w-]+)(?:(~=|\^=|\$=|\*=|\|=|=)([""']?)(.+?)\3)?$");
            if (!match.Success) return new AttrSelector(s.Trim(), "", "");
            return new AttrSelector(
                match.Groups[1].Value.ToLower(),
                match.Groups[2].Value,
                match.Groups[4].Value
            );
        }
    }
}
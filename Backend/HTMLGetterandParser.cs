using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.RegularExpressions;

namespace MyApplication
{
    // Mengembalikan tipe data yang dicari Program.cs
    public enum ParseErrorType { None, UnexpectedClosingTag, UnmatchedClosingTag, MalformedAttribute, UnclosedTag, OrphanNode, EmptyTagName }
    public record ParseError(ParseErrorType Type, string Detail, int CharPosition);

    public class TreeNode
    {
        private static int _counter = 0;
        public string NodeId { get; } = $"n{System.Threading.Interlocked.Increment(ref _counter)}";
        public TreeNode? Parent { get; set; }
        public int Depth { get; set; } = 0;
        public string Tag { get; set; }
        public bool IsTextNode { get; set; } = false;
        public string? TextContent { get; set; } = null;
        public List<string> Classes { get; set; } = new List<string>();
        public Dictionary<string, string> Attributes { get; } = new Dictionary<string, string>();
        public List<TreeNode> Children { get; } = new List<TreeNode>();
        public string? HtmlId => Attributes.TryGetValue("id", out var v) ? v : null;

        public TreeNode(string tag) => Tag = tag;
        public void AddChild(TreeNode child) { 
            child.Parent = this; 
            child.Depth = this.Depth + 1; 
            Children.Add(child); 
        }
        public int MaxDepth() => Children.Count == 0 ? Depth : Children.Max(c => c.MaxDepth());
        public int SubtreeSize() => 1 + Children.Sum(c => c.SubtreeSize());
    }

    public class HTMLGetterandParser
    {
        static readonly string[] voidTags = { "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr" };
        static readonly HttpClient client = new HttpClient() { Timeout = TimeSpan.FromSeconds(15) };

        public static async Task<string?> FetchHTML(string url) {
            try { 
                if (!client.DefaultRequestHeaders.Contains("User-Agent"))
                    client.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0");
                return await client.GetStringAsync(url); 
            } catch { return null; }
        }

        // menerima parameter errors
        public static TreeNode? ParseHTML(string html, List<ParseError>? errors = null)
        {
            errors ??= new List<ParseError>();

            // Hapus konten script/style 
            html = Regex.Replace(html, @"", "", RegexOptions.Singleline);
            html = Regex.Replace(html, @"<(script|style)\b[^>]*>.*?</\1>", "<$1></$1>", RegexOptions.Singleline | RegexOptions.IgnoreCase);

            string temp = "", textBuffer = "";
            TreeNode? root = null;
            var stack = new Stack<TreeNode>();
            bool inTag = false;
            int tagStartPos = 0;

            for (int i = 0; i < html.Length; i++)
            {
                char c = html[i];
                if (c == '<') {
                    if (!string.IsNullOrWhiteSpace(textBuffer) && stack.Count > 0) {
                        var p = EnsureBody(stack, "#text");
                        p.AddChild(new TreeNode("#text") { IsTextNode = true, TextContent = textBuffer.Trim() });
                    }
                    textBuffer = ""; inTag = true; tagStartPos = i;
                }
                else if (c == '>' && inTag) {
                    inTag = false;
                    ProcessTag(temp, ref root, stack, errors, tagStartPos);
                    temp = "";
                }
                else if (inTag) temp += c;
                else textBuffer += c;
            }

            // Error: tag yang tidak ditutup di akhir dokumen
            // (lewati html/head/body karena sering implicitly ditutup)
            var skipImplicit = new HashSet<string> { "html", "head", "body" };
            while (stack.Count > 0) {
                var unclosed = stack.Pop();
                if (!skipImplicit.Contains(unclosed.Tag) && !unclosed.IsTextNode)
                    errors.Add(new ParseError(ParseErrorType.UnclosedTag,
                        $"Tag '<{unclosed.Tag}>' tidak ditutup sampai akhir dokumen", html.Length - 1));
            }

            return root;
        }

        private static TreeNode EnsureBody(Stack<TreeNode> stack, string tag) {
            var curr = stack.Peek();
            if (curr.Tag == "html" && tag != "body" && tag != "head") {
                var body = curr.Children.FirstOrDefault(c => c.Tag == "body") ?? new TreeNode("body");
                if (body.Parent == null) curr.AddChild(body);
                if (!stack.Contains(body)) stack.Push(body);
                return body;
            }
            return curr;
        }

        private static void ProcessTag(string raw, ref TreeNode? root, Stack<TreeNode> stack, List<ParseError> errors, int charPos) {
            raw = raw.Trim();
            if (string.IsNullOrEmpty(raw)) return;

            bool isExit = raw.StartsWith("/");
            string content = isExit ? raw.Substring(1).Trim() : raw;
            bool selfClose = content.EndsWith("/");
            if (selfClose) content = content.Substring(0, content.Length - 1).TrimEnd();

            // Ambil tag name
            int spaceIdx = -1;
            for (int k = 0; k < content.Length; k++) {
                if (content[k] == ' ' || content[k] == '\t' || content[k] == '\n' || content[k] == '\r') {
                    spaceIdx = k; break;
                }
            }
            string tagName = (spaceIdx < 0 ? content : content.Substring(0, spaceIdx)).ToLower().Trim();
            string attrStr = spaceIdx < 0 ? "" : content.Substring(spaceIdx + 1).Trim();

            // Error: tag name kosong
            if (string.IsNullOrEmpty(tagName)) {
                errors.Add(new ParseError(ParseErrorType.EmptyTagName, $"Tag dengan nama kosong ditemukan", charPos));
                return;
            }

            // Error: tag name mengandung karakter tidak valid
            if (!Regex.IsMatch(tagName, @"^[a-z][a-z0-9-]*$") && tagName != "!doctype" && !tagName.StartsWith("!")) {
                errors.Add(new ParseError(ParseErrorType.EmptyTagName, $"Nama tag tidak valid: '{tagName}'", charPos));
                // tetap lanjutkan parsing jika masih bisa
            }

            // Abaikan doctype dan komentar
            if (tagName.StartsWith("!")) return;

            if (isExit) {
                // Error: unmatched closing tag (stack kosong)
                if (stack.Count == 0) {
                    errors.Add(new ParseError(ParseErrorType.UnmatchedClosingTag,
                        $"Closing tag '</{tagName}>' tanpa opening tag yang sesuai", charPos));
                    return;
                }
                // Error: unexpected closing tag
                if (stack.Peek().Tag != tagName) {
                    // Coba cari di stack  pasangannya
                    bool foundInStack = stack.Any(n => n.Tag == tagName);
                    if (foundInStack) {
                        // Pop sampai ketemu tag yang cocok, catat semua yang diskip sebagai UnclosedTag
                        while (stack.Count > 0 && stack.Peek().Tag != tagName) {
                            var skipped = stack.Pop();
                            if (!skipped.IsTextNode)
                                errors.Add(new ParseError(ParseErrorType.UnclosedTag,
                                    $"Tag '<{skipped.Tag}>' tidak ditutup (implicitly ditutup oleh '</{tagName}>')", charPos));
                        }
                        errors.Add(new ParseError(ParseErrorType.UnexpectedClosingTag,
                            $"Tag '</{tagName}>' menutup sebelum tag di dalamnya ditutup", charPos));
                        if (stack.Count > 0) stack.Pop();
                    } else {
                        errors.Add(new ParseError(ParseErrorType.UnmatchedClosingTag,
                            $"Closing tag '</{tagName}>' tanpa opening tag yang sesuai", charPos));
                    }
                    return;
                }
                stack.Pop();
                return;
            }

            var node = new TreeNode(tagName);

            // Parse atribut yg handle quoted values dengan spasi
            if (!string.IsNullOrEmpty(attrStr)) {
                ParseAttributes(attrStr, node, errors, charPos);
            }

            if (root == null && tagName == "html") { root = node; stack.Push(node); return; }
            if (stack.Count > 0) {
                var parent = EnsureBody(stack, tagName);
                parent.AddChild(node);
            } else {
                // Node orphan (ada node di luar root)
                errors.Add(new ParseError(ParseErrorType.OrphanNode,
                    $"Tag '<{tagName}>' muncul di luar struktur root", charPos));
            }

            if (!voidTags.Contains(tagName) && !selfClose) stack.Push(node);
        }

        // Parse atribut 
        private static void ParseAttributes(string attrStr, TreeNode node, List<ParseError> errors, int charPos) {
            int i = 0;
            while (i < attrStr.Length) {
                // Skip whitespace
                while (i < attrStr.Length && char.IsWhiteSpace(attrStr[i])) i++;
                if (i >= attrStr.Length) break;

                // Baca nama atribut
                int nameStart = i;
                while (i < attrStr.Length && attrStr[i] != '=' && !char.IsWhiteSpace(attrStr[i])) i++;
                string attrName = attrStr.Substring(nameStart, i - nameStart).ToLower().Trim();

                if (string.IsNullOrEmpty(attrName)) { i++; continue; }

                // Skip whitespace setelah nama
                while (i < attrStr.Length && char.IsWhiteSpace(attrStr[i])) i++;

                string attrValue = "";
                if (i < attrStr.Length && attrStr[i] == '=') {
                    i++; // lewati '='
                    while (i < attrStr.Length && char.IsWhiteSpace(attrStr[i])) i++;

                    if (i < attrStr.Length && (attrStr[i] == '"' || attrStr[i] == '\'')) {
                        // Quoted value ambil semua isi termasuk spasi
                        char quote = attrStr[i];
                        i++;
                        int valStart = i;
                        while (i < attrStr.Length && attrStr[i] != quote) i++;
                        attrValue = attrStr.Substring(valStart, i - valStart);
                        if (i < attrStr.Length) i++; // lewati closing quote
                        else errors.Add(new ParseError(ParseErrorType.MalformedAttribute,
                            $"Atribut '{attrName}' tidak memiliki closing quote", charPos));
                    } else {
                        // Unquoted value
                        int valStart = i;
                        while (i < attrStr.Length && !char.IsWhiteSpace(attrStr[i])) i++;
                        attrValue = attrStr.Substring(valStart, i - valStart);
                    }
                }
                // boolean attribute (tanpa value) attrValue tetap ""

                if (attrName == "class") {
                    // Split class value berdasarkan whitespace
                    var classes = attrValue.Split(new[] {' ', '\t', '\n', '\r'}, StringSplitOptions.RemoveEmptyEntries);
                    node.Classes.AddRange(classes);
                } else {
                    node.Attributes[attrName] = attrValue;
                }
            }
        }
    }
}
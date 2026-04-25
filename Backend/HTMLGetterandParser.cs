using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

namespace MyApplication
{
    enum GeneralState
    {
        Default,
        Tag,
        SQuote,
        DQuote
    }

    enum TagState
    {
        Default,
        Class,
        Rel,
        AutoC,
        Atrb,
        Exit,
        Comment
    }

    public class TreeNode
    {
        // ID unik per node, Parent, Depth
        private static int _counter = 0;
        public string NodeId { get; } = $"n{System.Threading.Interlocked.Increment(ref _counter)}";
        public TreeNode? Parent { get; set; }
        public int Depth { get; set; } = 0;

        public string Tag { get; set; }
        public List<string> Classes { get; set; } = new List<string>();
        public List<string> Rels { get; set; } = new List<string>();
        public List<string> Autocompletes { get; set; } = new List<string>();
        private Dictionary<string, string> attributes = new Dictionary<string, string>();
        public IReadOnlyDictionary<string, string> Attributes => attributes;
        public List<TreeNode> Children { get; } = new List<TreeNode>();

        // HtmlId shortcut untuk CSS selector id
        public string? HtmlId => attributes.TryGetValue("id", out var v) ? v : null;
        // =========================================================

        public TreeNode(string tag) => Tag = tag;

        // AddChild yg auto set Parent dan Depth 
        public void AddChild(TreeNode child)
        {
            child.Parent = this;
            child.Depth = this.Depth + 1;
            Children.Add(child);
        }

        public void AddClass(string class_) => Classes.Add(class_);
        public void AddRel(string rel_) => Rels.Add(rel_);
        public void AddAutocomplete(string autocomplete_) => Autocompletes.Add(autocomplete_);

        public void AddAttribute(string name, string val)
        {
            if (!attributes.ContainsKey(name))
            {
                attributes.Add(name, val);
            }
        }

        public int MaxDepth()
        {
            if (Children.Count == 0) return Depth;
            return Children.Max(c => c.MaxDepth());
        }

        public int SubtreeSize()
        {
            return 1 + Children.Sum(c => c.SubtreeSize());
        }

        static bool[] printTreeHelper = Enumerable.Repeat(false, 100).ToArray();
        public void printTree(int depth, bool lastChild)
        {
            for (int i = 0; i < depth - 1; i++)
            {
                Console.Write(printTreeHelper[i] ? "|" : " ");
            }
            if (depth > 0)
            {
                Console.Write(lastChild ? "L" : "#");
            }
            Console.WriteLine(Tag + "(" + depth + ")");
            if (Children.Count > 1)
            {
                printTreeHelper[depth] = true;
            }
            for (int i = 0; i < Children.Count; i++)
            {
                if (i == Children.Count - 1)
                {
                    printTreeHelper[depth] = false;
                }
                Children[i].printTree(depth + 1, i == Children.Count - 1);
            }
        }
    }

    public class HTMLGetterandParser
    {
        static string[] voidTags = { "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr" };
        static string[] blockTags = { "address", "blockquote", "dd", "div", "dl", "dt", "canvas", "form", "Heading", "hr", "li", "main", "nav", "noscript", "ol", "pre", "section", "tfoot", "ul", "table", "p", "video", "aside", "article", "figcaption", "fieldset", "figure", "footer", "header" };
        static string[] listTags = { "li", "ol", "ul" };
        static string[] descTags = { "dt", "dd" };
        static string[] optTags = { "option", "optgroup" };
        static string[] tableTags = { "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup" };

        static readonly HttpClient client = new HttpClient();

        // FetchHTML dipisah 
        public static async Task<string?> FetchHTML(string url)
        {
            try
            {
                client.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent", "C# Application");
                return await client.GetStringAsync(url);
            }
            catch (Exception e)
            {
                Console.WriteLine($"Request error: {e.Message}");
                return null;
            }
        }

        public static TreeNode? ParseHTML(string html)
        {
            string temp = "";
            TreeNode? root = null;
            Stack<TreeNode> nodeStack = new Stack<TreeNode>();
            GeneralState GS = GeneralState.Default;
            int inScript = 0;

            for (int i = 0; i < html.Length; i++)
            {
                if (html[i] == '<' && GS == GeneralState.Default)
                {
                    if (!(inScript == 2 && html[i + 1] != '/')) GS = GeneralState.Tag;
                }
                else if (html[i] == '>' && GS == GeneralState.Tag)
                {
                    GS = GeneralState.Default;
                    bool firstArg = true;
                    bool isDoctype = false;
                    TagState TS = TagState.Default;
                    string arg = string.Empty;
                    TreeNode? curNode = null;
                    bool inSQ = false;
                    bool inDQ = false;

                    string atrb = string.Empty;

                    for (int j = 0; j < temp.Length; j++)
                    {
                        if (isDoctype == true) break;
                        if (temp[0] == '/') TS = TagState.Exit;
                        if (temp[0] == '!')
                        {
                            TS = TagState.Comment;
                            break;
                        }
                        if (temp[j] == ' ' && firstArg == true)
                        {
                            if (arg.Equals("!doctype", StringComparison.OrdinalIgnoreCase))
                            {
                                isDoctype = true;
                            }
                            else
                            {
                                if (arg.Equals("script", StringComparison.OrdinalIgnoreCase)) inScript = 1;
                                firstArg = false;
                                curNode = new TreeNode(arg.ToLower());
                                arg = string.Empty;
                            }
                        }
                        else if (TS == TagState.Default && temp[j] == '=')
                        {
                            if (arg.Equals("class", StringComparison.OrdinalIgnoreCase))
                            {
                                TS = TagState.Class;
                            }
                            else if (arg.Equals("rel", StringComparison.OrdinalIgnoreCase))
                            {
                                TS = TagState.Rel;
                            }
                            else if (arg.Equals("autocomplete", StringComparison.OrdinalIgnoreCase))
                            {
                                TS = TagState.AutoC;
                            }
                            else
                            {
                                TS = TagState.Atrb;
                                atrb = arg;
                            }
                            arg = string.Empty;
                        }
                        else if (TS != TagState.Default && temp[j] == '\"' && inDQ == false && inSQ == false)
                        {
                            inDQ = true;
                        }
                        else if (TS != TagState.Default && temp[j] == '\'' && inDQ == false && inSQ == false)
                        {
                            inSQ = true;
                        }
                        else if (TS != TagState.Default && temp[j] == '\"' && inDQ == true && inSQ == false)
                        {
                            inDQ = false;
                            switch (TS)
                            {
                                case TagState.Class:
                                    curNode!.Classes = new List<string>(arg.Split(' '));
                                    break;
                                case TagState.Rel:
                                    curNode!.Rels = new List<string>(arg.Split(' '));
                                    break;
                                case TagState.AutoC:
                                    curNode!.Autocompletes = new List<string>(arg.Split(' '));
                                    break;
                                case TagState.Atrb:
                                    curNode!.AddAttribute(atrb, arg);
                                    break;
                            }
                            TS = TagState.Default;
                            arg = string.Empty;
                            atrb = string.Empty;
                        }
                        else if (TS != TagState.Default && temp[j] == '\'' && inDQ == false && inSQ == true)
                        {
                            inSQ = false;
                            switch (TS)
                            {
                                case TagState.Class:
                                    curNode!.Classes = new List<string>(arg.Split(' '));
                                    break;
                                case TagState.Rel:
                                    curNode!.Rels = new List<string>(arg.Split(' '));
                                    break;
                                case TagState.AutoC:
                                    curNode!.Autocompletes = new List<string>(arg.Split(' '));
                                    break;
                                case TagState.Atrb:
                                    curNode!.AddAttribute(atrb, arg);
                                    break;
                            }
                            TS = TagState.Default;
                            arg = string.Empty;
                            atrb = string.Empty;
                        }
                        else if ((TS != TagState.Default && TS != TagState.Exit) || (TS == TagState.Default && temp[j] != ' ') || (TS == TagState.Exit && temp[j] != '/'))
                        {
                            arg += temp[j];
                        }
                        if ((TS == TagState.Default || TS == TagState.Exit) && j == temp.Length - 1 && firstArg == true)
                        {
                            firstArg = false;
                            curNode = new TreeNode(arg.ToLower());
                            if (arg.Equals("script", StringComparison.OrdinalIgnoreCase)) inScript = 1;
                            arg = string.Empty;
                        }
                    }

                    if (TS == TagState.Exit && nodeStack.Count > 0 && curNode!.Tag.Equals(nodeStack.Peek().Tag, StringComparison.OrdinalIgnoreCase))
                    {
                        nodeStack.Pop();
                        if (curNode.Tag.Equals("script", StringComparison.OrdinalIgnoreCase)) { inScript = 0; }
                    }
                    else if (isDoctype == false && TS != TagState.Comment && inScript != 2)
                    {
                        bool optional_closing = nodeStack.Count > 0 && curNode!.Tag.Equals("body", StringComparison.OrdinalIgnoreCase) && nodeStack.Peek().Tag.Equals("head", StringComparison.OrdinalIgnoreCase);
                        bool blockTag = blockTags.Contains(curNode!.Tag);
                        optional_closing = optional_closing || (nodeStack.Count > 0 && blockTag && nodeStack.Peek().Tag.Equals("p", StringComparison.OrdinalIgnoreCase));
                        bool listTag = listTags.Contains(curNode.Tag);
                        optional_closing = optional_closing || (nodeStack.Count > 0 && listTag && nodeStack.Peek().Tag.Equals("li", StringComparison.OrdinalIgnoreCase));
                        bool descTag = descTags.Contains(curNode.Tag);
                        optional_closing = optional_closing || (nodeStack.Count > 0 && descTag && nodeStack.Peek().Tag.Equals("dt", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && descTag && nodeStack.Peek().Tag.Equals("dd", StringComparison.OrdinalIgnoreCase));
                        bool optTag = optTags.Contains(curNode.Tag);
                        optional_closing = optional_closing || (nodeStack.Count > 0 && optTag && nodeStack.Peek().Tag.Equals("option", StringComparison.OrdinalIgnoreCase));
                        bool tableTag = tableTags.Contains(curNode.Tag);
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("thead", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("tbody", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("tfoot", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("tr", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("th", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("td", StringComparison.OrdinalIgnoreCase));
                        optional_closing = optional_closing || (nodeStack.Count > 0 && tableTag && nodeStack.Peek().Tag.Equals("colgroup", StringComparison.OrdinalIgnoreCase));
                        if (optional_closing == true)
                        {
                            nodeStack.Pop();
                        }
                        if (curNode.Tag.Equals("html", StringComparison.OrdinalIgnoreCase))
                        {
                            root = curNode;
                            nodeStack.Push(curNode); // push html ke stack
                        }
                        else if (nodeStack.Count > 0)
                        {
                            // auto-set Parent & Depth 
                            nodeStack.Peek().AddChild(curNode);
                            if (inScript == 1) inScript = 2;
                        }

                        bool voidTag = voidTags.Contains(curNode.Tag);
                        if (voidTag == false) nodeStack.Push(curNode);
                    }
                    temp = string.Empty;
                    curNode = null;
                }
                else if (html[i] == '\"' && GS == GeneralState.Default)
                {
                    GS = GeneralState.DQuote;
                }
                else if (html[i] == '\"' && GS == GeneralState.DQuote)
                {
                    GS = GeneralState.Default;
                }
                else if (html[i] == '\'' && GS == GeneralState.Default)
                {
                    GS = GeneralState.SQuote;
                }
                else if (html[i] == '\'' && GS == GeneralState.SQuote)
                {
                    GS = GeneralState.Default;
                }
                else if (GS == GeneralState.Tag)
                {
                    temp += html[i];
                }
            }

            if (nodeStack.Count > 0 && nodeStack.Peek().Tag.Equals("body", StringComparison.OrdinalIgnoreCase)) nodeStack.Pop();
            if (nodeStack.Count > 0 && nodeStack.Peek().Tag.Equals("html", StringComparison.OrdinalIgnoreCase)) nodeStack.Pop();

            return root;
        }
    }
}
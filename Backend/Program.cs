using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using System.Collections.Generic;
using System.Linq;
using System;
using MyApplication;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

var app = builder.Build();
app.UseCors();

// Helper serialisasi 

static Dictionary<string, object?> SerializeNode(TreeNode node) {
    return new Dictionary<string, object?> {
        ["nodeId"]      = node.NodeId,
        ["tag"]         = node.Tag,
        ["isTextNode"]  = node.IsTextNode,
        ["textContent"] = node.TextContent,
        ["classes"]     = node.Classes,
        ["htmlId"]      = node.HtmlId,
        ["attributes"]  = node.Attributes.ToDictionary(k => k.Key, v => v.Value),
        ["depth"]       = node.Depth,
        ["subtreeSize"] = node.SubtreeSize(),
        ["maxDepth"]    = node.MaxDepth(),
        ["children"]    = node.Children.Select(SerializeNode).ToList()
    };
}

// parse 

app.MapPost("/parse", async (HttpRequest req) => {
    var body = await JsonSerializer.DeserializeAsync<ParseRequest>(req.Body,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    if (body == null) return Results.BadRequest("Invalid request body");

    string? html = await ResolveHtml(body.Url, body.HtmlText);
    if (html == null) return Results.BadRequest("Gagal fetch URL atau htmlText kosong");

    var errors = new List<ParseError>();
    var root = HTMLGetterandParser.ParseHTML(html, errors);
    if (root == null) return Results.BadRequest("Gagal parse HTML");

    return Results.Ok(new {
        tree   = SerializeNode(root),
        errors = errors.Select(e => new { type = e.Type.ToString(), detail = e.Detail, pos = e.CharPosition })
    });
});

// traverse 

app.MapPost("/traverse", async (HttpRequest req) => {
    var body = await JsonSerializer.DeserializeAsync<TraverseRequest>(req.Body,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    if (body == null) return Results.BadRequest("Invalid request body");

    string? html = await ResolveHtml(body.Url, body.HtmlText);
    if (html == null) return Results.BadRequest("Gagal fetch URL atau htmlText kosong");

    var errors = new List<ParseError>();
    var root = HTMLGetterandParser.ParseHTML(html, errors);
    if (root == null) return Results.BadRequest("Gagal parse HTML");

    var selector  = new CssSelector(body.CssSelector ?? "*");
    var traverser = new DomTraverser(root, selector);

    List<TraversalStep> steps;
    List<string> matchedIds;

    var sw = System.Diagnostics.Stopwatch.StartNew();
    if (string.Equals(body.Algorithm, "dfs", StringComparison.OrdinalIgnoreCase))
        (steps, matchedIds) = traverser.DFS(body.TopN ?? 0);
    else
        (steps, matchedIds) = traverser.BFS(body.TopN ?? 0);
    sw.Stop();

    var limitedMatches = matchedIds;

    return Results.Ok(new {
        tree           = SerializeNode(root),
        steps          = steps,
        matchedNodeIds = limitedMatches,
        totalMatches   = matchedIds.Count,
        nodesVisited   = steps.Count,
        elapsedMs      = sw.Elapsed.TotalMilliseconds,
        algorithm      = body.Algorithm?.ToUpper() ?? "BFS",
        parseErrors    = errors.Select(e => new { type = e.Type.ToString(), detail = e.Detail, pos = e.CharPosition })
    });
});

// Helper 

static async Task<string?> ResolveHtml(string? url, string? htmlText) {
    if (!string.IsNullOrWhiteSpace(url))
        return await HTMLGetterandParser.FetchHTML(url);
    if (!string.IsNullOrWhiteSpace(htmlText))
        return htmlText;
    return null;
}

app.Run();

record ParseRequest(string? Url, string? HtmlText);
record TraverseRequest(string? Url, string? HtmlText, string? CssSelector, string? Algorithm, int? TopN);
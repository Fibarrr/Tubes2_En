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
{
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();
app.UseCors();

// serialisasi TreeNode ke Dictionary untuk JSON

static Dictionary<string, object?> SerializeNode(TreeNode node)
{
    return new Dictionary<string, object?>
    {
        ["nodeId"]      = node.NodeId,
        ["tag"]         = node.Tag,
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
// Hanya fetch + parse HTML, gak ada traversal DOM Tree

app.MapPost("/parse", async (HttpRequest req) =>
{
    var body = await JsonSerializer.DeserializeAsync<ParseRequest>(req.Body,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

    if (body == null) return Results.BadRequest("Invalid request body");

    string? html = null;
    if (!string.IsNullOrWhiteSpace(body.Url))
    {
        html = await HTMLGetterandParser.FetchHTML(body.Url);
        if (html == null) return Results.BadRequest("Gagal fetch URL");
    }
    else if (!string.IsNullOrWhiteSpace(body.HtmlText))
    {
        html = body.HtmlText;
    }
    else
    {
        return Results.BadRequest("Berikan url atau htmlText");
    }

    var root = HTMLGetterandParser.ParseHTML(html);
    if (root == null) return Results.BadRequest("Gagal parse HTML");

    return Results.Ok(SerializeNode(root));
});

// traverse 
// Fetch + parse + BFS/DFS + CSS selector matching

app.MapPost("/traverse", async (HttpRequest req) =>
{
    var body = await JsonSerializer.DeserializeAsync<TraverseRequest>(req.Body,
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

    if (body == null) return Results.BadRequest("Invalid request body");

    string? html = null;
    if (!string.IsNullOrWhiteSpace(body.Url))
    {
        html = await HTMLGetterandParser.FetchHTML(body.Url);
        if (html == null) return Results.BadRequest("Gagal fetch URL");
    }
    else if (!string.IsNullOrWhiteSpace(body.HtmlText))
    {
        html = body.HtmlText;
    }
    else
    {
        return Results.BadRequest("Berikan url atau htmlText");
    }

    var root = HTMLGetterandParser.ParseHTML(html);
    if (root == null) return Results.BadRequest("Gagal parse HTML");

    var selector  = new CssSelector(body.CssSelector ?? "*");
    var traverser = new DomTraverser(root, selector);

    List<TraversalStep> steps;
    List<string> matchedIds;

    var sw = System.Diagnostics.Stopwatch.StartNew();
    if (string.Equals(body.Algorithm, "dfs", StringComparison.OrdinalIgnoreCase))
        (steps, matchedIds) = traverser.DFS();
    else
        (steps, matchedIds) = traverser.BFS();
    sw.Stop();

    // limit Top-N jika diminta
    int limit = (body.TopN.HasValue && body.TopN.Value > 0) ? body.TopN.Value : int.MaxValue;
    var limitedMatches = matchedIds.Take(limit).ToList();

    return Results.Ok(new
    {
        tree           = SerializeNode(root),
        steps          = steps,
        matchedNodeIds = limitedMatches,
        totalMatches   = matchedIds.Count,
        nodesVisited   = steps.Count,
        elapsedMs      = sw.Elapsed.TotalMilliseconds,
        algorithm      = body.Algorithm?.ToUpper() ?? "BFS"
    });
});

app.Run();

// DTOs

record ParseRequest(string? Url, string? HtmlText);

record TraverseRequest(
    string? Url,
    string? HtmlText,
    string? CssSelector,
    string? Algorithm,
    int?    TopN
);
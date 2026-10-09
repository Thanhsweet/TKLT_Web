import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { server } = await import("../server.js");
test("HTTP static, security headers, authorization and malformed request handling", async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const home = await fetch(base + "/");
    assert.equal(home.status, 200);
    const html = await home.text();
    const assets = [
      ...html.matchAll(/<link\b[^>]*href="([^"]+)"/g),
      ...html.matchAll(/<script\b[^>]*src="([^"]+)"/g),
    ];
    assert.ok(assets.length > 0);
    for (const [, path] of assets) {
      const asset = await fetch(new URL(path, base));
      assert.equal(asset.status, 200, `Homepage asset failed: ${path}`);
      if ([".js", ".css"].some((ext) => new URL(path, base).pathname.endsWith(ext)))
        assert.equal(asset.headers.get("cache-control"), "no-cache");
      if (path.endsWith(".css"))
        assert.match(asset.headers.get("content-type"), /^text\/css\b/);
    }
    const r = await fetch(base + "/account.html");
    assert.equal(r.status, 200);
    assert.match(await r.text(), /id="navigation"/);
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
    const denied = await fetch(base + "/api/manage/users");
    assert.equal(denied.status, 401);
    const cross = await fetch(base + "/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.invalid",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
    const webhook = await fetch(base + "/api/webhooks/sepay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(webhook.status, 401);
    const malformed = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

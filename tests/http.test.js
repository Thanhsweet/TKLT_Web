import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
const { server, isPublicFile } = await import("../server.js");
const { win32, posix } = await import("node:path");
test("static path boundary accepts Windows and POSIX files and rejects escapes", () => {
  for (const [api, root] of [
    [win32, "C:/Users/Admin/source/TKLT/_Web/_Web/public"],
    [posix, "/app/public"],
  ]) {
    const base = api.resolve(root);
    for (const file of [
      "index.html",
      "css/styles.css",
      "js/app.js",
      "assets/tennis.webp",
    ])
      assert.equal(isPublicFile(base, api.join(base, file), api), true, file);
    for (const file of [
      base,
      api.resolve(base, "..", "server.js"),
      api.resolve(base, "..", "public-other", "secret"),
    ])
      assert.equal(isPublicFile(base, file, api), false, file);
  }
  assert.equal(isPublicFile("C:\\app\\public", "D:\\secret.txt", win32), false);
});
test("HTTP static, security headers, authorization and malformed request handling", async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    for (const [path, type] of [
      ["/", "text/html"],
      ["/css/styles.css", "text/css"],
      ["/js/app.js", "text/javascript"],
      ["/assets/tennis.webp", "image/webp"],
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.ok(response.headers.get("content-type").startsWith(type), path);
      assert.ok((await response.arrayBuffer()).byteLength > 0, path);
    }
    const outside = await fetch(base + "/..%5cserver.js");
    assert.notEqual(outside.status, 200);
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

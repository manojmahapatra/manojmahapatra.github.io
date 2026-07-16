import assert from "node:assert/strict";
import test from "node:test";
import { getSafeTweetUrl, getYouTubeVideoId } from "../src/utils/embedSecurity.mjs";
import { serializeJsonForHtml } from "../src/utils/security.mjs";

test("JSON-LD serialization cannot terminate its script element", () => {
  const payload = { title: "</script><script>alert(1)</script>", separator: "\u2028" };
  const serialized = serializeJsonForHtml(payload);

  assert.equal(serialized.includes("</script"), false);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), payload);
});

test("YouTube parsing accepts supported forms and returns only a safe ID", () => {
  assert.equal(getYouTubeVideoId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(
    getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "dQw4w9WgXcQ",
  );
  assert.equal(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10"), "dQw4w9WgXcQ");
});

test("YouTube parsing rejects host confusion and attribute-breaking input", () => {
  assert.equal(getYouTubeVideoId("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(
    getYouTubeVideoId('https://www.youtube.com/watch?v=x%22%20onload=%22alert(1)'),
    null,
  );
  assert.equal(getYouTubeVideoId("http://youtu.be/dQw4w9WgXcQ"), null);
});

test("tweet parsing accepts exact HTTPS providers and strips tracking data", () => {
  assert.equal(
    getSafeTweetUrl("https://x.com/example/status/123456?utm_source=test#fragment"),
    "https://x.com/example/status/123456",
  );
  assert.equal(getSafeTweetUrl("https://twitter.com.evil.test/example/status/123456"), null);
  assert.equal(getSafeTweetUrl('https://x.com/example/status/123%22%20onclick=%22alert(1)'), null);
});

// Unit tests for the pure aggregation logic. Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../api/_aggregate");
const { companySlug, slugify: contentSlugify } = require("../api/_content");

test("slugify produces clean url-safe slugs", () => {
  assert.equal(A.slugify("Sysco Corp."), "sysco-corp");
  assert.equal(A.slugify("  Multiple   Spaces  "), "multiple-spaces");
  assert.equal(A.slugify("Café & Co"), "caf-co");
});

test("decodeEntities strips tags and decodes entities", () => {
  assert.equal(A.decodeEntities("<b>A&amp;B</b> &#8217;s"), "A&B 's");
  assert.equal(A.decodeEntities("<![CDATA[hello]]>"), "hello");
});

test("decodeEntities decodes double-encoded input one level only", () => {
  // "&amp;lt;" is the TEXT "&lt;", not a "<" — decoding must not collapse twice.
  assert.equal(A.decodeEntities("Tom &amp;amp; Jerry"), "Tom &amp; Jerry");
  assert.equal(A.decodeEntities("a &amp;lt; b"), "a &lt; b");
});

test("decodeEntities survives invalid numeric references", () => {
  // An out-of-range code point makes String.fromCodePoint throw; it must not abort the parse.
  assert.equal(A.decodeEntities("bad &#1114112; ref"), "bad ref");
});

test("truncate respects length and adds ellipsis", () => {
  assert.equal(A.truncate("short", 100), "short");
  assert.ok(A.truncate("a ".repeat(200), 50).endsWith("..."));
});

test("looksLikeBreach matches breach phrasing only", () => {
  assert.equal(A.looksLikeBreach("Acme suffers a data breach"), true);
  assert.equal(A.looksLikeBreach("Millions of records exposed online"), true);
  assert.equal(A.looksLikeBreach("New product launch announced"), false);
});

test("parseFeed extracts breach items and filters the rest", () => {
  const xml = `<rss><channel>
    <item><title>BigCo data breach exposes customers</title><link>https://x.test/a</link><pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate><description>A data breach.</description></item>
    <item><title>BigCo launches new app</title><link>https://x.test/b</link><description>A product update.</description></item>
  </channel></rss>`;
  const items = A.parseFeed(xml, "TestSource");
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "TestSource");
  assert.equal(items[0].sourceType, "news");
  assert.match(items[0].title, /data breach/);
});

test("parseFeed rejects non-web link schemes", () => {
  const xml = `<rss><channel>
    <item><title>Evil data breach</title><link>javascript:alert(1)</link><description>A data breach.</description></item>
    <item><title>Real data breach</title><link>https://x.test/ok</link><description>A data breach.</description></item>
  </channel></rss>`;
  const items = A.parseFeed(xml, "TestSource");
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://x.test/ok");
});

test("computeAdvice tailors guidance to exposed data", () => {
  const pw = A.computeAdvice({ tags: ["Passwords", "Email addresses"], sourceType: "breach" });
  assert.ok(pw.some((a) => /two-factor/i.test(a)));
  const generic = A.computeAdvice({ tags: [], sourceType: "news" });
  assert.ok(generic.length >= 1);
});

test("computeFaq builds question/answer pairs", () => {
  const faq = A.computeFaq({ title: "BigCo", summary: "A breach.", affected: 1000, tags: ["Email addresses"], advice: ["Do X."], occurred: "2026-01-01", sourceType: "breach" });
  assert.ok(faq.length >= 3);
  assert.ok(faq.every((f) => f.q && f.a));
  assert.ok(faq.some((f) => /how many/i.test(f.q)));
});

test("clusterNews collapses same-incident stories, keeps distinct ones", () => {
  const items = [
    { id: "1", sourceType: "news", title: "Aflac discloses data breach", published: "2026-06-30T00:00:00Z" },
    { id: "2", sourceType: "news", title: "Aflac Japan breach hits millions", published: "2026-06-29T00:00:00Z" },
    { id: "3", sourceType: "news", title: "Nissan employee data stolen", published: "2026-06-28T00:00:00Z" },
  ];
  const out = A.clusterNews(items);
  assert.equal(out.length, 2); // the two Aflac stories merge, Nissan stays
  assert.ok(out.find((x) => x.id === "1").alsoReported >= 2);
});

test("companySlug groups by domain root", () => {
  assert.equal(companySlug({ domain: "sysco.com", title: "Sysco" }), "sysco");
  assert.equal(companySlug({ domain: null, title: "Some Site" }), "some-site");
  assert.equal(contentSlugify("A B"), "a-b");
});

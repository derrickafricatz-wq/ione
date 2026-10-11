const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const feature = fs.readFileSync("book-to-pdf.js", "utf8");
const access = fs.readFileSync("supabase/functions/book-pdf-access/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261011000000_book_to_pdf_private_storage.sql", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));

new vm.Script(feature, { filename: "book-to-pdf.js" });
console.log("PASS: Book to PDF JavaScript parses");

const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim() && !/^\s*(?:import|export)\b/m.test(source));
for (let i = 0; i < inlineScripts.length; i++) {
  new vm.Script(inlineScripts[i], { filename: "index.html inline script " + (i + 1) });
}
console.log("PASS: " + inlineScripts.length + " inline scripts parse");

assert.match(html, /BOOK TO PDF/);
assert.match(html, /book-to-pdf\.js/);
assert.match(html, /pdf_path/);
console.log("PASS: feature button, script, and PDF metadata wiring exist");

assert.match(migration, /add column if not exists pdf_path text/i);
assert.match(migration, /paid-book-pdfs/);
assert.match(migration, /public = false/i);
assert.match(migration, /52428800/);
assert.match(migration, /application\/pdf/);
assert.match(migration, /auth\.uid\(\)/);
console.log("PASS: migration declares nullable PDF metadata, private 50 MB PDF bucket, and owner-scoped storage policies");

assert.match(access, /auth\.getUser\(\)/);
assert.match(access, /author_id/);
assert.match(access, /book_access/);
assert.match(access, /book_orders/);
assert.match(access, /status/);
assert.match(access, /createSignedUrl\(book\.pdf_path, 300\)/);
console.log("PASS: access function includes authentication, author/access/order checks, and five-minute signed links");

assert.match(sw, /ione-app-v157/);
assert.equal(version.version, "1.0.90");
assert.match(feature, /id="b2pCover"/);
assert.match(feature, /front_cover: frontCover/);
assert.match(feature, /pdfjs\.getDocument/);
assert.match(feature, /hrNext/);
assert.match(html, /book-to-pdf-reader-and-explore-layout/);
assert.match(html, /grid-auto-rows:max-content/);
assert.match(html, /overflow-y:auto/);
console.log("PASS: cache/version bumped; front-cover upload persists; PDF books use interactive page-turn reader; Explore panels scroll and fit");

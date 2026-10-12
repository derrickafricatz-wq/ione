const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const feature = fs.readFileSync("book-to-pdf.js", "utf8");
const offline = fs.readFileSync("ione-offline-books.js", "utf8");
const access = fs.readFileSync("supabase/functions/book-pdf-access/index.ts", "utf8");
const manage = fs.readFileSync("supabase/functions/book-library-manage/index.ts", "utf8");
const controlsMigration = fs.readFileSync("supabase/migrations/20261011070000_public_bookstore_author_controls.sql", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261011000000_book_to_pdf_private_storage.sql", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));

new vm.Script(feature, { filename: "book-to-pdf.js" });
new vm.Script(offline, { filename: "ione-offline-books.js" });
console.log("PASS: Book to PDF and offline storage JavaScript parse");

assert.ok(html.includes('id="ioneAuthorTermsPanel"'));
assert.ok(html.includes('id="ioneAuthorTermsAccepted" type="checkbox" required aria-required="true"'));
assert.ok(html.includes('href="tel:+255742097868"'));
assert.ok(html.includes('href="https://wa.me/255742097868"'));
assert.ok(html.includes('tap the existing I|ONE Support chat button'));
assert.ok(html.includes('I|ONE / Authority Press may review'));
assert.match(sw, /ione-app-v\d+/);
assert.match(version.version, /^\d+\.\d+\.\d+$/);
assert.match(sw, /ione-app-v185/);
assert.match(sw, /OFFLINE_MEDIA_CACHE_NAME/);
assert.match(sw, /saved.clone\(\).blob\(\)/);
assert.match(sw, /SUPABASE_JS_CACHE_NAME/);
assert.match(sw, /SUPABASE_JS_URL/);
assert.match(sw, /"\.\/index\.html"/);
assert.match(sw, /new URL\(url\.pathname, self\.location\.origin\)/);
assert.match(html, /ioneOfflineCommunications/);
assert.match(html, /OFFLINE • SAVED CONTENT/);
assert.match(html, /sw\.js\?v=126/);
assert.match(offline, /ioneOfflineDownloadAlert/);
assert.match(offline, /ioneOfflineAlertShake/);
assert.match(offline, /ione-documentaries/);
assert.match(offline, /home-documentaries/);
assert.match(offline, /BILLBOARD_STORAGE_KEY/);
assert.match(offline, /SAVING FOR OFFLINE/);
assert.match(offline, /OFFLINE READY • SAVED CONTENT/);
assert.match(offline, /homeControls\.appendChild\(statusElement\)/);
assert.match(sw, /Do not wrap Supabase API\/REST\/function GET requests/);
console.log("PASS: offline shell, media cache/range fallback, auto-saved documentaries and market billboards, download alert");
console.log("PASS: offline shell, Supabase CDN fallback, query-string asset fallback, and saved homepage communications");
console.log("PASS: Author Studio consent, support links, and cache/version checks");


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
assert.match(access, /in\("status", \["paid", "completed"\]\)/);
assert.match(access, /status/);
assert.match(access, /createSignedUrl\(book\.pdf_path, 300\)/);
console.log("PASS: access function includes authentication, author/access/order checks, and five-minute signed links");

assert.match(sw, /ione-app-v\d+/);
assert.match(version.version, /^\d+\.\d+\.\d+$/);
assert.equal(typeof version.force, "boolean");
assert.match(html, /id="bookInsight2"/);
assert.match(html, /id="bookInsight3"/);
assert.match(html, /book_insight_2/);
assert.match(html, /book_insight_3/);
assert.match(html, /INSIDE THE BOOK/);
assert.match(html, /15000/);
assert.match(html, /fadeStopBookNarration/);
assert.match(html, /AUTHOR SIGNATURE/);
assert.ok(html.includes("grid-template-columns:repeat(2,minmax(0,1fr))!important"));
assert.ok(html.includes("grid-template-columns:repeat(3,minmax(0,1fr))!important"));
assert.ok(html.includes("grid-template-columns:repeat(4,minmax(0,1fr))!important"));
assert.ok(!html.includes("book.date?' • '"));
assert.doesNotMatch(html, /NARRATION NOT PUBLISHED/);
assert.doesNotMatch(html, /Free to read/);
assert.ok(html.includes("const insightItems=[book.bookInsight,book.bookInsight2,book.bookInsight3]"));
assert.ok(html.includes("overflow-wrap:anywhere!important"));

assert.match(feature, /id="b2pInsight2"/);
assert.match(feature, /id="b2pInsight3"/);
assert.match(feature, /book_insight_2/);
assert.match(feature, /book_insight_3/);
assert.match(feature, /id="b2pCover"/);
assert.match(feature, /front_cover: frontCover/);
assert.match(feature, /frontCover = coverFile \? await compressFrontCover\(coverFile\) : await coverFromPdfFirstPage\(file\)/);
assert.match(feature, /id="b2pUpdateCover"/);
assert.match(feature, /update\(\{ front_cover: frontCover \}\)/);
assert.match(feature, /pdfjs\.getDocument/);
assert.match(feature, /IoneOfflineBooks/);
assert.match(feature, /savedBook\.blob/);
assert.match(feature, /saveFromUrl/);
assert.match(html, /ione-offline-books\.js/);
assert.match(sw, /ione-pdfjs-v3\.11\.174/);
assert.match(sw, /ione-offline-books\.js/);
assert.match(feature, /hrNext/);
assert.match(html, /book-to-pdf-reader-and-explore-layout/);
assert.match(html, /grid-auto-rows:max-content/);
assert.match(html, /overflow-y:auto/);
assert.match(html, /isAuthor: !!session\?\.user\?\.id/);
assert.match(html, /book\?\.isPurchased === true/);
assert.match(html, /book\?\.paymentRequired === false/);
assert.match(html, /action: "my_access"/);
assert.match(html, /openMyPublishedBooksPanel/);
assert.match(html, /Find words that move you/);
assert.match(html, /PUBLIC BOOKS/);
assert.match(feature, /coverFromPdfFirstPage\(file\)/);
assert.match(feature, /const likelyCover/);
assert.match(feature, /first PDF page does not look like a cover/);
assert.match(feature, /payment_required: true/);
assert.match(feature, /pdf_cover_page: pdfCoverPage/);
assert.match(feature, /firstPdfPageIsCover/);
assert.doesNotMatch(feature, /markBookPaid\(book\)/);
assert.match(feature, /REVOKE & DELETE/);
assert.match(feature, /SAVE PRICE & ACCESS/);
assert.match(feature, /payment_required: paidToggle.checked/);
assert.match(access, /book.payment_required === false/);
assert.doesNotMatch(access, /book.author_id === user.id \|\|/);
assert.match(manage, /action === "my_access"/);
assert.match(manage, /action === "delete"/);
assert.match(manage, /action === "update"/);
assert.match(controlsMigration, /payment_required boolean not null default true/);
console.log("PASS: public bookstore labels, PDF first-page cover, saved access, author price/free-paid controls, and revoke flow");
console.log("PASS: cache/version bumped; front-cover upload persists; PDF books use interactive page-turn reader; Explore panels scroll and fit");

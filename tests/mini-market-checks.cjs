const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const sokoni = fs.readFileSync("ione-sokoni.js", "utf8");
const moduleSource = fs.readFileSync("ione-mini-market.js", "utf8");
const edge = fs.readFileSync("supabase/functions/ione-mini-market/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261113100801_ione_mini_market.sql", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));

new vm.Script(moduleSource, { filename: "ione-mini-market.js" });
assert.ok(html.includes('ione-mini-market.js?v=1'));
assert.ok(sw.includes('"./ione-mini-market.js"'));
assert.ok(sw.includes('ione-app-v375'));
assert.equal(version.version, "1.0.320");
assert.ok(sokoni.includes("<b>Mini Market</b>"));
assert.ok(!sokoni.includes("openSmallSuppliers"));
assert.ok(moduleSource.includes("window.IoneMiniMarket"));
assert.ok(moduleSource.includes('id="mmJoinPhone"'));
assert.ok(moduleSource.includes('id="mmMenuForm"'));
assert.ok(moduleSource.includes('id="mmPhoto"'));
assert.ok(moduleSource.includes('id="mmAuthoritySection"'));
assert.ok(moduleSource.includes('category.addEventListener("click",open)'));

for (const table of ["ione_mini_market_vendors","ione_mini_market_payment_requests","ione_mini_market_products","ione_mini_market_orders","ione_mini_market_order_items"]) {
  assert.ok(migration.includes("create table if not exists public." + table));
  assert.ok(migration.includes("alter table public." + table + " enable row level security"));
}
for (const action of ["submit","my_status","public_products","my_products","save_product","delete_product","set_open","place_order","my_orders","update_order_status","authority_dashboard","approve","reject"]) {
  assert.ok(edge.includes('action === "' + action + '"'), "Missing Mini Market action: " + action);
}
assert.ok(edge.includes("authorityOk(admin, token)"));
assert.ok(edge.includes("ione-mini-market-products"));
assert.ok(!edge.includes("ione_mama_chakula"));
assert.ok(!edge.includes("request_delivery"));
assert.ok(migration.includes("revoke all on public.ione_mini_market_vendors"));
assert.ok(migration.includes("values ('ione-mini-market-products','ione-mini-market-products',false,5242880"));
console.log("PASS: Mini Market isolated registration, product uploads, customer orders, Authority approval and PWA wiring");

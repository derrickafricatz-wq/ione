const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const html = fs.readFileSync("index.html", "utf8");
const sokoni = fs.readFileSync("ione-sokoni.js", "utf8");
const moduleSource = fs.readFileSync("ione-mini-market.js", "utf8");
const edge = fs.readFileSync("supabase/functions/ione-mini-market/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261113090000_ione_mini_market.sql", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));
new vm.Script(moduleSource, { filename: "ione-mini-market.js" });
assert.match(html, /ione-mini-market\\.js\\?v=1/);
assert.match(sw, /ione-mini-market\\.js/);
assert.match(sw, /ione-app-v375/);
assert.equal(version.version, "1.0.320");
assert.match(sokoni, /<b>Mini Market<\\/b>/);
assert.doesNotMatch(sokoni, /openSmallSuppliers/);
assert.match(moduleSource, /window\\.IoneMiniMarket/);
assert.match(moduleSource, /id="mmJoinPhone"/);
assert.match(moduleSource, /id="mmMenuForm"/);
assert.match(moduleSource, /id="mmPhoto"/);
assert.match(moduleSource, /id="mmAuthoritySection"/);
assert.match(moduleSource, /category\\.addEventListener\\("click",open\\)/);
for (const table of ["ione_mini_market_vendors","ione_mini_market_payment_requests","ione_mini_market_products","ione_mini_market_orders","ione_mini_market_order_items"]) {
  assert.match(migration, new RegExp("create table if not exists public\\\\." + table));
  assert.match(migration, new RegExp("alter table public\\\\." + table + " enable row level security", "i"));
}
for (const action of ["submit","my_status","public_products","my_products","save_product","delete_product","set_open","place_order","my_orders","update_order_status","authority_dashboard","approve","reject"]) {
  assert.match(edge, new RegExp('action === "' + action + '"'));
}
assert.match(edge, /authorityOk\\(admin, token\\)/);
assert.match(edge, /ione-mini-market-products/);
assert.doesNotMatch(edge, /ione_mama_chakula|request_delivery|mama-food/);
assert.match(migration, /revoke all on public\\.ione_mini_market_vendors/);
assert.match(migration, /values \\\(\'ione-mini-market-products\',\'ione-mini-market-products\',false,5242880/);
console.log("PASS: Mini Market isolated registration, product uploads, customer orders, Authority approval and PWA wiring");

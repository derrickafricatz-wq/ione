const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));
const moduleSource = fs.readFileSync("ione-sokoni.js", "utf8");
const edge = fs.readFileSync("supabase/functions/ione-sokoni/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261017080000_ione_sokoni_vendor_access.sql", "utf8");
const riderMigration = fs.readFileSync("supabase/migrations/20261017110000_ione_sokoni_rider_verification.sql", "utf8");

new vm.Script(moduleSource, { filename: "ione-sokoni.js" });
console.log("PASS: Sokoni frontend module parses");

const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim() && !/^\s*(?:import|export)\b/m.test(source));
for (let i = 0; i < inlineScripts.length; i++) {
  new vm.Script(inlineScripts[i], { filename: "index.html inline script " + (i + 1) });
}
console.log("PASS: existing inline scripts parse");

for (const id of ["openAfrilink", "openTranscript", "openHealth", "openAuthority", "openIoneGift", "openIoneSupport", "openSokoni"]) {
  assert.ok(html.includes('id="' + id + '"'), "Missing home service tile: " + id);
}
assert.match(html, /ione-sokoni\.js\?v=1/);
assert.match(html, /sw\.js\?v=132/);
assert.match(html, /"ione-manual-subscriptions", "ione-sokoni"/);
console.log("PASS: Sokoni is additive; existing service buttons remain present");

for (const table of ["ione_sokoni_vendors", "ione_sokoni_payment_requests", "ione_sokoni_products", "ione_sokoni_orders"]) {
  assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security", "i"));
  assert.match(migration, new RegExp("revoke all on public\\." + table + " from anon, authenticated", "i"));
}
assert.match(migration, /amount_tzs integer not null default 1000 check \(amount_tzs = 1000\)/);
assert.match(migration, /period_days integer not null default 30 check \(period_days = 30\)/);
assert.match(migration, /values \('ione-sokoni-products', 'ione-sokoni-products', false/);
assert.match(migration, /file_size_limit = 5242880/);
console.log("PASS: separate RLS-protected Sokoni records, fixed monthly fee and private product-photo bucket");
for (const column of ["identity_document_type", "identity_document_path", "motorcycle_plate", "rider_group_name", "chairman_phone"]) {
  assert.match(riderMigration, new RegExp("add column if not exists " + column));
}
assert.match(riderMigration, /ione-sokoni-rider-documents/);
assert.match(riderMigration, /create policy "Sokoni riders upload own verification documents"/);
console.log("PASS: private rider identity upload and verification fields");

for (const action of ["submit", "my_status", "public_vendors", "public_products", "my_products", "save_product", "delete_product", "place_order", "my_orders", "update_order_status", "save_pickup_location", "rider_apply", "rider_status", "rider_availability", "rider_heartbeat", "public_riders", "request_delivery", "rider_open_deliveries", "accept_delivery", "set_delivery_fee", "confirm_delivery_fee", "update_delivery_status", "update_rider_location", "my_deliveries", "complete_delivery", "authority_dashboard", "approve", "reject", "approve_rider", "reject_rider"]) {
  assert.ok(edge.includes('action === "' + action + '"'), "Missing Edge Function action: " + action);
}
assert.match(edge, /validAuthoritySession\(admin, rawSession\)/);
assert.match(edge, /admin\.auth\.getUser\(token\)/);
assert.match(edge, /eq\("stock_quantity", product\.stock_quantity\)/);
assert.match(edge, /createSignedUrl\(r\.photo_path, 3600\)/);
assert.match(edge, /totalRevenueTzs/);
assert.match(edge, /identity_document_path/);
assert.match(edge, /createSignedUrl\(application\.identity_document_path, 600\)/);
assert.match(edge, /riderApplications,/);
assert.match(moduleSource, /isRiderIdentityFile/);
assert.match(moduleSource, /motorcycle_plate/);
assert.match(moduleSource, /smart-grid #openSokoni\{order:1\}/);
assert.match(edge, /Reserve this rider first/);
assert.match(edge, /rider_heartbeat/);
assert.match(edge, /Trip is no longer active; live location sharing has stopped/);
assert.match(html, /IONE_AUTHORITY_BODY_FUNCTIONS = new Set\([\s\S]*?"ione-sokoni"/);
assert.match(html, /IONE_AUTHORITY_HEADER_FUNCTIONS = new Set\([\s\S]*?"ione-sokoni"/);
assert.match(sw, /ione-app-v242/);
assert.match(sw, /\.\/ione-sokoni\.js/);
assert.match(version.version, /^1\.0\.176$/);
console.log("PASS: user/session checks, admin-session protection, stock race guard, signed photos and PWA versioning");

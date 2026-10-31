const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");
const sw = fs.readFileSync("sw.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));
const ui = fs.readFileSync("ione-transport.js", "utf8");
const edge = fs.readFileSync("supabase/functions/ione-transport/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261031010000_ione_transport_driver_onboarding_v1.sql", "utf8");

new vm.Script(ui, { filename: "ione-transport.js" });
console.log("PASS: i1 Transport browser module parses");

assert.match(html, /id="openBusBooking"/);
assert.match(html, /i1 TRANSPORT/);
assert.match(html, /TAXI • SPECIAL HIRE • SHUTTLE • BUS/);
assert.doesNotMatch(html, /id="openBusBooking"[^>]*smart-coming-soon/);
assert.match(html, /ione-transport\.js\?v=1/);
assert.match(html, /sw\.js\?v=141/);
assert.match(html, /\["transport","🚕","i1 TRANSPORT"/);
console.log("PASS: homepage and guide expose i1 Transport instead of the Bus Coming Soon tile");

assert.match(sw, /ione-transport\.js/);
assert.match(sw, /ione-app-v352/);
assert.equal(version.version, "1.0.295");
console.log("PASS: PWA cache and version include the new Transport module");

assert.match(migration, /ione_transport_driver_applications/);
assert.match(migration, /ione_transport_drivers/);
assert.match(migration, /enable row level security/);
assert.match(migration, /public = false/);
assert.match(edge, /validAuthoritySession/);
assert.match(edge, /action === "authority_dashboard"/);
assert.match(edge, /action === "approve"/);
assert.match(edge, /availability: "offline"/);
assert.match(edge, /createSignedUrl/);
console.log("PASS: private driver onboarding, document review and Authority approval safeguards are present");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "data", "definitions");
const config = JSON.parse(fs.readFileSync(path.join(root, "BellascapeGameplay.json"), "utf8"));
assert.ok(config.defaultLoadout);
assert.ok(Object.keys(config.loadouts).length >= 10);
for (const [key, setup] of Object.entries(config.loadouts)) {
  assert.match(key, /^[a-z0-9-]+$/);
  assert.ok(setup.label && setup.preset);
}
for (const zone of ["safe", "danger", "training"]) {
  assert.ok(Number.isInteger(config.zones[zone].x));
  assert.ok(Number.isInteger(config.zones[zone].y));
}
assert.equal(config.persistence.database, "sqlite");
console.log(`Bellascape config smoke passed: ${Object.keys(config.loadouts).length} loadouts`);

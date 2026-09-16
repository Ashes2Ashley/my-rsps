import * as assert from "node:assert/strict";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { Projectile } from "../src/main/typescript/elvarg/game/model/Projectile";

const mobile = (x: number, y: number, size: number): any => ({
    getLocation: () => new Location(x, y, 0),
    getSize: () => size,
});

// 1x1 mobiles (players, small npcs) keep firing from their own tile.
assert.deepEqual(Projectile.centreOf(mobile(3200, 3200, 1)), new Location(3200, 3200, 0));

// KBD is 5x5: its Location is the south-west corner, the body sits two tiles in.
assert.deepEqual(Projectile.centreOf(mobile(3200, 3200, 5)), new Location(3202, 3202, 0));

// Even sizes land on the south-west of the two centre tiles (tile grid has no halves).
assert.deepEqual(Projectile.centreOf(mobile(3200, 3200, 4)), new Location(3201, 3201, 0));

// Nonsense sizes must not drag the origin off the mobile.
assert.deepEqual(Projectile.centreOf(mobile(3200, 3200, 0)), new Location(3200, 3200, 0));

console.info("projectile origin smoke passed");

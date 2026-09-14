import assert = require("node:assert/strict");
import fs = require("node:fs");
import os = require("node:os");
import path = require("node:path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { RegionManager } from "../src/main/typescript/elvarg/game/collision/RegionManager";
import { ObjectSpawnDefinitionLoader } from "../src/main/typescript/elvarg/game/definition/loader/impl/ObjectSpawnDefinitionLoader";
import { DefinitionLoader } from "../src/main/typescript/elvarg/game/definition/loader/DefinitionLoader";
import { MapObjects } from "../src/main/typescript/elvarg/game/entity/impl/object/MapObjects";
import { ObjectManager } from "../src/main/typescript/elvarg/game/entity/impl/object/ObjectManager";
import { World } from "../src/main/typescript/elvarg/game/World";

async function main() {
    await CachePipeline.initialize();
    RegionManager.init();
    RegionManager.loadMapFiles(3090, 3494);
    const chair = [...MapObjects.mapObjects.values()].flat().find((object) =>
        object.getLocation().getX() === 3090 && object.getLocation().getY() === 3494
        && object.getLocation().getZ() === 0 && object.getType() === 11
        && object.getDefinition()?.isSolid()
    );
    assert(chair, "bank chair exists in the cache");
    const clipping = () => RegionManager.getClipping(3090, 3494, 0, null);
    const originalClipping = clipping();
    assert(originalClipping & 0x100, "chair blocks movement");
    // Recreate startup: the loader must decode an unloaded region before removal.
    MapObjects.mapObjects.clear();
    RegionManager.init();
    const loader = new ObjectSpawnDefinitionLoader();
    assert(loader.file().endsWith("object-spawns.json"));
    assert.doesNotThrow(() => loader.load());
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "object-spawns-"));
    loader.file = () => path.join(temp, "object-spawns.json");
    const record = {
        id: chair.getId(), type: chair.getType(), face: chair.getFace(),
        position: { x: 3090, y: 3494, z: 0 }, remove: true,
    };
    const write = (records: unknown[]) => fs.writeFileSync(loader.file(), JSON.stringify(records));
    try {
        write([record]);
        loader.load();
        assert.equal(MapObjects.get(record.id, chair.getLocation(), null), null);
        assert.equal(clipping() & 0x100, 0, "saved removal clears real cache collision");
        const sent: number[] = [];
        ObjectManager.onRegionChange({
            getPrivateArea: () => null,
            getPacketSender: () => ({ sendObjectRemoval: (object: any) => sent.push(object.getId()) }),
        } as any, 3050, 3450, 0);
        assert.deepEqual(sent, [record.id], "region entry replays the saved removal");
        const replacement = { id: 31858, position: record.position, type: 10, face: 3 };
        write([record, replacement]);
        loader.load();
        const replayOrder: string[] = [];
        ObjectManager.onRegionChange({
            getPrivateArea: () => null,
            getPacketSender: () => ({
                sendObjectRemoval: () => replayOrder.push("remove"),
                sendObject: () => replayOrder.push("add"),
            }),
        } as any, 3050, 3450, 0);
        assert.deepEqual(replayOrder, ["remove", "add"], "remove the diagonal chair before adding the normal-shaped altar");
        ObjectManager.deregister(MapObjects.get(replacement.id, chair.getLocation(), null), true);
        World.getRemovedObjects().splice(0);
        write([record]);
        loader.load();
        assert.equal(World.getRemovedObjects().length, 1, "repeated removal is idempotent");
        write([{ ...record, remove: false }]);
        loader.load();
        assert(MapObjects.get(record.id, chair.getLocation(), null));
        assert.equal(clipping(), originalClipping, "spawning restores collision");
        assert.equal(World.getRemovedObjects().length, 0);
        const wall = { id: 1853, position: record.position, type: 0, face: 0 };
        write([{ ...record, remove: false }, wall]);
        loader.load();
        assert(World.getObjects().some((object) => object.getId() === record.id), "adding a wall does not discard the chair on the same tile");
        assert(World.getObjects().some((object) => object.getId() === wall.id));
        write([]);
        DefinitionLoader.registerSource(ObjectSpawnDefinitionLoader.DEFINITION_TYPE, "removal-smoke", {
            load: () => [record],
        });
        loader.load();
        assert.equal(MapObjects.get(record.id, chair.getLocation(), null), null, "plugin sources support removal too");
        for (const invalid of [{ ...record, remove: "true" }, { ...record, id: -1 }]) {
            write([invalid]);
            assert.throws(() => loader.load(), /Invalid object spawn/);
        }
        console.info("[object-spawns-smoke] passed");
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

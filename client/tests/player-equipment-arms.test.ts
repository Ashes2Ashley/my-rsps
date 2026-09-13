import assert from "node:assert/strict";

import { EquipmentSlot } from "../rs/config/player/Equipment";
import { Gender, PlayerAppearance } from "../rs/config/player/PlayerAppearance";
import { PlayerModelLoader } from "../rs/config/player/PlayerModelLoader";

function composedKits(wearPos: number, wearPos2: number, wearPos3 = -1): number[] {
    const item = { wearPos, wearPos2, wearPos3 };
    const loader = new PlayerModelLoader(
        { getCount: () => 0 } as any,
        { load: () => item } as any,
        {} as any,
        {} as any,
    );
    let result: PlayerAppearance | undefined;
    (loader as any).buildStaticModel = (appearance: PlayerAppearance) => {
        result = appearance;
        return {};
    };
    const equip = new Array(14).fill(-1);
    equip[wearPos === 0 ? EquipmentSlot.HEAD : EquipmentSlot.BODY] = 100;
    loader.buildStaticModelFromEquipment(
        new PlayerAppearance(Gender.MALE, [0, 0, 0, 0, 0], [10, 11, 12, 13, 14, 15, 16], equip),
        equip,
    );
    assert.ok(result);
    return result.kits;
}

function composedEquipment(): { ids: number[]; layers: number[] } {
    const items = new Map([
        [100, { id: 100, wearPos: 2, wearPos2: -1, wearPos3: -1 }],
        [101, { id: 101, wearPos: 3, wearPos2: -1, wearPos3: -1 }],
        [102, { id: 102, wearPos: 4, wearPos2: -1, wearPos3: -1 }],
        [103, { id: 103, wearPos: 1, wearPos2: -1, wearPos3: -1 }],
        [104, { id: 104, wearPos: 0, wearPos2: -1, wearPos3: -1 }],
    ]);
    const loader = new PlayerModelLoader(
        { getCount: () => 0 } as any,
        { load: (id: number) => items.get(id) } as any,
        {} as any,
        {} as any,
    );
    let result = { ids: [] as number[], layers: [] as number[] };
    (loader as any).buildStaticModel = (
        _appearance: PlayerAppearance,
        extras: any[],
        layers: number[],
    ) => {
        result = { ids: extras.map((item) => item.id), layers };
        return {};
    };
    const equip = new Array(14).fill(-1);
    equip[EquipmentSlot.AMULET] = 100;
    equip[EquipmentSlot.WEAPON] = 101;
    equip[EquipmentSlot.BODY] = 102;
    equip[EquipmentSlot.CAPE] = 103;
    equip[EquipmentSlot.HEAD] = 104;
    loader.buildStaticModelFromEquipment(
        new PlayerAppearance(Gender.MALE, [0, 0, 0, 0, 0], new Array(7).fill(-1), equip),
        equip,
    );
    return result;
}

function firstPersonEquipment(): { kits: number[]; ids: number[] } {
    const items = new Map([
        [100, { id: 100 }],
        [101, { id: 101 }],
        [102, { id: 102 }],
        [103, { id: 103 }],
    ]);
    const loader = new PlayerModelLoader(
        { getCount: () => 0 } as any,
        { load: (id: number) => items.get(id) } as any,
        {} as any,
        {} as any,
    );
    let result = { kits: [] as number[], ids: [] as number[] };
    (loader as any).buildStaticModel = (appearance: PlayerAppearance, extras: any[]) => {
        result = { kits: appearance.kits, ids: extras.map((item) => item.id) };
        return {};
    };
    const equip = new Array(14).fill(-1);
    equip[EquipmentSlot.WEAPON] = 100;
    equip[EquipmentSlot.SHIELD] = 101;
    equip[EquipmentSlot.GLOVES] = 102;
    equip[EquipmentSlot.BODY] = 103;
    loader.buildFirstPersonModel(
        new PlayerAppearance(Gender.MALE, [0, 0, 0, 0, 0], [10, 11, 12, 13, 14, 15, 16], equip),
    );
    return result;
}

assert.deepEqual(composedKits(4, -1).slice(2, 4), [-1, 13], "chainbody must retain arms");
assert.deepEqual(composedKits(4, 6).slice(2, 4), [-1, -1], "platebody must hide arms");
assert.deepEqual(composedKits(0, 8, 11).slice(0, 2), [-1, -1], "full helmets must hide hair and jaw");
assert.deepEqual(composedKits(0, 11).slice(0, 2), [10, -1], "masks must retain the head kit");
assert.deepEqual(composedEquipment(), {
    ids: [104, 103, 102, 101, 100],
    layers: [7, 7, 0, 7, 4],
});
assert.deepEqual(firstPersonEquipment(), {
    kits: [-1, -1, -1, 13, -1, -1, -1],
    ids: [100, 101, 102],
});

console.log("Player equipment arm-slot regression test passed");

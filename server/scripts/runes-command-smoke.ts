/**
 * ::runes: spawns every standard rune when there is room, and stops with a
 * single summary message instead of one "couldn't hold all those items" per
 * rune when the inventory runs out of slots.
 */
import * as assert from "node:assert/strict";
import * as path from "node:path";
import { CacheDefinitions } from "../src/main/typescript/elvarg/game/cache/CacheDefinitions";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { PluginManager } from "../src/main/typescript/elvarg/plugins/PluginManager";
import { CommandPacketListener } from "../src/main/typescript/elvarg/net/packet/impl/CommandPacketListener";
import { PlayerRights } from "../src/main/typescript/elvarg/game/model/rights/PlayerRights";
import { Inventory } from "../src/main/typescript/elvarg/game/model/container/impl/Inventory";
import { Item } from "../src/main/typescript/elvarg/game/model/Item";

const RUNE_IDS = [554, 555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 565, 566, 9075, 21880, 28929];

function makePlayer(rights: PlayerRights, filler: Array<[number, number]>) {
  const messages: string[] = [];
  const player: any = {
    getHitpoints: () => 99,
    getUsername: () => "smoke",
    getRights: () => rights,
    getPacketSender: () => ({
      sendMessage: (m: string) => messages.push(m),
      sendItemContainer: () => {},
    }),
  };
  const inventory = new Inventory(player);
  filler.forEach(([id, amount], slot) => (inventory.getItems()[slot] = new Item(id, amount)));
  player.getInventory = () => inventory;
  return { player, inventory, messages };
}

const runeStacks = (inventory: Inventory) =>
  inventory
    .getItems()
    .filter((item: any) => RUNE_IDS.includes(item.getId()))
    .map((item: any) => [item.getId(), item.getAmount()]);

async function main() {
  await CachePipeline.initialize();
  PluginManager.loadFromDirectory(path.join(process.cwd(), "plugins"));

  // Empty inventory: every rune type lands, one confirmation message.
  const empty = makePlayer(PlayerRights.DEVELOPER, []);
  CommandPacketListener.execute(empty.player, "runes");
  assert.deepEqual(
    runeStacks(empty.inventory).sort((a, b) => a[0] - b[0]),
    RUNE_IDS.map((id) => [id, 1000]),
    "every standard rune is spawned"
  );
  assert.deepEqual(empty.messages, ["Spawned 1,000 of each rune type."]);
  assert.equal(new Item(28929).getDefinition().isDropable(), true, "Sunfire runes should drop");

  const itemCount = CacheDefinitions.getCounts().items;
  for (let id = 0; id < itemCount; id++) {
    const cached = CacheDefinitions.getItem(id);
    const shouldDrop = cached.inventoryActions[4]?.toLowerCase() === "drop";
    assert.equal(
      new Item(id).getDefinition().isDropable(),
      shouldDrop,
      `${id} (${cached.name}) should follow its cache drop action`,
    );
  }

  // Full inventory, no runes held: nothing fits, exactly one message.
  const full = makePlayer(
    PlayerRights.DEVELOPER,
    Array.from({ length: 28 }, () => [4151, 1] as [number, number])
  );
  CommandPacketListener.execute(full.player, "runes");
  assert.deepEqual(runeStacks(full.inventory), [], "no runes spawn without space");
  assert.deepEqual(full.messages, ["Spawned 0/16 rune types - free up inventory space for the rest."]);

  // One free slot plus a held rune stack: the stack tops up, one new type lands.
  const partial = makePlayer(PlayerRights.DEVELOPER, [
    [560, 29],
    ...Array.from({ length: 26 }, () => [4151, 1] as [number, number]),
  ]);
  CommandPacketListener.execute(partial.player, "runes");
  assert.deepEqual(
    runeStacks(partial.inventory).sort((a, b) => a[0] - b[0]),
    [[554, 1000], [560, 1029]],
    "existing stacks top up and the free slot is used"
  );
  assert.equal(partial.messages.length, 1, "no per-rune message spam");

  // Non-staff are refused - by the core, from the rights array ::runes registered with.
  const mortal = makePlayer(PlayerRights.NONE, []);
  CommandPacketListener.execute(mortal.player, "runes");
  assert.deepEqual(runeStacks(mortal.inventory), [], "players cannot spawn runes");
  assert.deepEqual(mortal.messages, ["You do not have permission to use this command."]);

  // A plugin can override those rights, e.g. a spawn mode opening ::runes to everyone.
  PluginManager.setCommandRights("runes", []);
  const spawnMode = makePlayer(PlayerRights.NONE, []);
  CommandPacketListener.execute(spawnMode.player, "runes");
  assert.equal(runeStacks(spawnMode.inventory).length, RUNE_IDS.length, "override opens ::runes");
  PluginManager.setCommandRights("runes", [PlayerRights.OWNER, PlayerRights.DEVELOPER]);
  const reclosed = makePlayer(PlayerRights.NONE, []);
  CommandPacketListener.execute(reclosed.player, "runes");
  assert.deepEqual(runeStacks(reclosed.inventory), [], "override can close ::runes again");

  console.log(`::runes command and item drop definitions OK (${itemCount} items)`);
  process.exit(0);
}
main();

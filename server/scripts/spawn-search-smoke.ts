/**
 * ::items / ::npcs spawn search: the command opens the cache's chatbox search, a picked row
 * arrives as "<id> <op>" and spawns that op's amount, Spawn X prompts for one, the search
 * ends on a pick and closes when the player walks away, and both the command and the
 * deferred pick are rights-gated.
 * Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' ts-node ./scripts/spawn-search-smoke.ts
 */
import * as assert from "node:assert/strict";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { PlayerRights } from "../src/main/typescript/elvarg/game/model/rights/PlayerRights";

async function main() {
  await CachePipeline.initialize();
  const { itemSearchCommand, closeSpawnSearchOnMove } =
    require("../plugins/commands/AdminCommands.plugin.js")._test;

  const added: Array<[number, number]> = [];
  const messages: string[] = [];
  const scripts: Array<[number, unknown]> = [];
  let syntaxAction: any = null;
  let amountAction: any = null;
  let moved = false;
  const player: any = {
    rights: PlayerRights.DEVELOPER,
    getRights() { return this.rights; },
    getInventory: () => ({ adds: (id: number, amount: number) => added.push([id, amount]) }),
    getMovementQueue: () => ({ didMoveThisCycle: () => moved }),
    getPacketSender: () => ({
      sendMessage: (message: string) => messages.push(message),
      sendInterfaceScript: (id: number, args: unknown) => scripts.push([id, args]),
      sendClientScript: (id: number, ...args: unknown[]) => scripts.push([id, args]),
      sendEnterAmountPrompt: (title: string) => scripts.push([108, title]),
    }),
    setEnteredSyntaxAction: (action: any) => { syntaxAction = action; },
    setEnteredAmountAction: (action: any) => { amountAction = action; },
  };
  const open = () => { scripts.length = 0; itemSearchCommand({ player, parts: ["items"] }); };

  const ABYSSAL_WHIP = 4151;

  open();
  assert.deepEqual(scripts, [[750, ["Item Search", 0, -1, 0]]], "the command opens the cache search");
  assert.ok(syntaxAction, "the pick is answered by an entered-syntax action");
  assert.equal(added.length, 0, "opening the search spawns nothing");

  // Spawn 1 / Spawn 5 / Spawn 10 are ops 1-3 on the row.
  for (const [op, amount] of [[1, 1], [2, 5], [3, 10]] as const) {
    added.length = 0;
    open();
    syntaxAction.execute(`${ABYSSAL_WHIP} ${op}`);
    assert.deepEqual(added, [[ABYSSAL_WHIP, amount]], `op ${op} spawns ${amount}`);
    assert.equal(syntaxAction, null, "a pick ends the search");
  }
  assert.ok(messages[0].includes("Abyssal whip"), `the message names the item, got: ${messages[0]}`);

  // Spawn X prompts first and spawns what was typed.
  added.length = 0;
  open();
  syntaxAction.execute(`${ABYSSAL_WHIP} 4`);
  assert.equal(added.length, 0, "Spawn X must not spawn before the amount arrives");
  assert.deepEqual(scripts.at(-1)?.[0], 108, "Spawn X prompts for an amount");
  amountAction.execute(250);
  assert.deepEqual(added, [[ABYSSAL_WHIP, 250]], "the entered amount is spawned");
  added.length = 0;
  amountAction.execute(9_999_999_999);
  assert.deepEqual(added, [[ABYSSAL_WHIP, 2147483647]], "over-large amounts clamp to int max");
  added.length = 0;
  amountAction.execute(0);
  assert.equal(added.length, 0, "an amount below one spawns nothing");

  // Walking away closes the search on the client and drops the pending pick.
  open();
  moved = true;
  closeSpawnSearchOnMove({ player });
  assert.deepEqual(scripts.at(-1), [138, []], "moving closes the search");
  assert.equal(syntaxAction, null, "moving drops the pending pick");
  closeSpawnSearchOnMove({ player });
  assert.equal(scripts.length, 2, "a closed search is not closed twice");
  moved = false;

  added.length = 0;
  open();
  player.rights = PlayerRights.NONE;
  syntaxAction.execute(`${ABYSSAL_WHIP} 1`);
  assert.equal(added.length, 0, "rights are re-checked when the pick arrives");

  scripts.length = 0;
  itemSearchCommand({ player, parts: ["items"] });
  assert.equal(scripts.length, 0, "a player cannot open the spawn search");

  console.log("spawn search smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

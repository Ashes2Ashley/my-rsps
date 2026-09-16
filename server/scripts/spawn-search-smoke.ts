/**
 * ::items / ::npcs spawn search: the command opens the cache's chatbox search, the id the
 * client resumes with is spawned with the requested amount, the search re-opens for the
 * next pick, and both the command and the deferred pick are rights-gated.
 * Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' ts-node ./scripts/spawn-search-smoke.ts
 */
import * as assert from "node:assert/strict";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { PlayerRights } from "../src/main/typescript/elvarg/game/model/rights/PlayerRights";

async function main() {
  await CachePipeline.initialize();
  const { itemSearchCommand } = require("../plugins/commands/AdminCommands.plugin.js")._test;

  const added: Array<[number, number]> = [];
  const messages: string[] = [];
  const scripts: Array<[number, (number | string)[]]> = [];
  let syntaxAction: any = null;
  const player: any = {
    rights: PlayerRights.DEVELOPER,
    getRights() { return this.rights; },
    getInventory: () => ({ adds: (id: number, amount: number) => added.push([id, amount]) }),
    getPacketSender: () => ({
      sendMessage: (message: string) => messages.push(message),
      sendInterfaceScript: (id: number, args: (number | string)[]) => scripts.push([id, args]),
    }),
    setEnteredSyntaxAction: (action: any) => { syntaxAction = action; },
  };

  const ABYSSAL_WHIP = 4151;

  itemSearchCommand({ player, parts: ["items", "250"] });
  assert.deepEqual(scripts, [[750, ["Item Search", 0, -1, 0]]], "the command opens the cache search");
  assert.ok(syntaxAction, "the pick is answered by an entered-syntax action");
  assert.equal(added.length, 0, "opening the search spawns nothing");

  syntaxAction.execute(String(ABYSSAL_WHIP));
  assert.deepEqual(added, [[ABYSSAL_WHIP, 250]], "the picked id spawns with the requested amount");
  assert.ok(messages[0].includes("Abyssal whip"), `the message names the item, got: ${messages[0]}`);
  assert.equal(scripts.length, 2, "the search re-opens for the next pick");

  added.length = 0;
  syntaxAction.execute("not-an-id");
  assert.equal(added.length, 0, "a non-numeric pick spawns nothing");

  player.rights = PlayerRights.NONE;
  syntaxAction.execute(String(ABYSSAL_WHIP));
  assert.equal(added.length, 0, "rights are re-checked when the pick arrives");

  messages.length = 0;
  scripts.length = 0;
  itemSearchCommand({ player, parts: ["items"] });
  assert.equal(scripts.length, 0, "a player cannot open the spawn search");

  player.rights = PlayerRights.DEVELOPER;
  itemSearchCommand({ player, parts: ["items", "0"] });
  assert.equal(scripts.length, 0, "an amount below one is rejected");
  assert.ok(messages.some((message) => message.includes("Usage: ::items")), "the usage is shown");

  console.log("spawn search smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import { Opcodes } from "../rs/cs2/Opcodes";
import { registerMarketOps } from "../rs/cs2/handlers/MarketOps";

const values = new Int32Array(8000);
values[7906] = -1;
const ctx: any = {
    intStack: new Int32Array(8),
    intStackSize: 0,
    pushInt(value: number) { this.intStack[this.intStackSize++] = value; },
    popInt() { return this.intStack[--this.intStackSize]; },
    varManager: { getVarp: (id: number) => values[id] },
};
const handlers = new Map<any, any>();
registerMarketOps(handlers);
const run = (opcode: Opcodes, slot = 0) => {
    ctx.pushInt(slot);
    handlers.get(opcode)(ctx, 0, null);
    return ctx.popInt();
};

assert.equal(run(Opcodes.STOCKMARKET_ISOFFEREMPTY), 1);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERITEM), -1);

values[7906] = 4151;
values[7900] = 1200000;
values[7901] = 2;
values[7902] = 2;
values[7903] = 2400000;
values[7904] = 1;
values[7905] = 5;
assert.equal(run(Opcodes.STOCKMARKET_ISOFFEREMPTY), 0);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERITEM), 4151);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERPRICE), 1200000);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERCOUNT), 2);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERCOMPLETEDCOUNT), 2);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERCOMPLETEDGOLD), 2400000);
assert.equal(run(Opcodes.STOCKMARKET_GETOFFERTYPE), 1);
assert.equal(run(Opcodes.STOCKMARKET_ISOFFERFINISHED), 1);

console.log("market opcode tests passed");

// Native search result script 754 resumes an object dialog with the chosen ID.
import { registerClientOps } from "../rs/cs2/handlers/ClientOps";
registerClientOps(handlers);
let selected: unknown;
ctx.cs2Vm = { onInputDialogComplete: (type: string, value: number) => { selected = [type, value]; } };
ctx.pushInt(4151);
handlers.get(Opcodes.RESUME_OBJDIALOG)(ctx, 0, null);
assert.deepEqual(selected, ["obj", 4151]);
assert.equal(ctx.intStackSize, 0);

// ::npcs reuses the same chatbox search: opened with NPC_SEARCH_TITLE, OC_FIND reads npc
// names, OC_NAME labels those rows with them, and no item icon is drawn for an npc id.
import { registerConfigOps } from "../rs/cs2/handlers/ConfigOps";
import { isNpcSearchResult, setNpcSearch } from "../rs/cs2/npcSearch";

registerConfigOps(handlers);
const npcs = ["Goblin", "Goblin Guard", "Hill Giant"];
const items = ["Goblin mail", "Bronze sword"];
ctx.stringStack = [];
ctx.stringStackSize = 0;
ctx.pushString = (value: string) => { ctx.stringStack[ctx.stringStackSize++] = value; };
ctx.popString = () => ctx.stringStack[--ctx.stringStackSize];
ctx.npcTypeLoader = { getCount: () => npcs.length, load: (id: number) => ({ name: npcs[id] }) };
ctx.objTypeLoader = { load: (id: number) => (items[id] ? { name: items[id] } : null) };

const find = (query: string) => {
    ctx.pushString(query);
    ctx.pushInt(0);
    handlers.get(Opcodes.OC_FIND)(ctx, 0, null);
    return ctx.popInt();
};
const name = (id: number) => {
    ctx.pushInt(id);
    handlers.get(Opcodes.OC_NAME)(ctx, 0, null);
    return ctx.popString();
};

setNpcSearch(false);
assert.equal(find("goblin"), 1, "an item search only sees items");
assert.equal(name(0), "Goblin mail");

setNpcSearch(true);
assert.equal(find("goblin"), 2, "an npc search sees every npc whose name matches");
assert.deepEqual(ctx.itemSearchResults, [0, 1]);
assert.equal(name(0), "Goblin", "result rows are labelled with the npc name");
assert.ok(isNpcSearchResult(1), "rows of the open npc search draw no item icon");
assert.ok(!isNpcSearchResult(2), "ids outside the results stay item lookups");

setNpcSearch(false);
assert.equal(name(0), "Goblin mail", "closing the npc search restores item names");

console.log("npc search opcode tests passed");

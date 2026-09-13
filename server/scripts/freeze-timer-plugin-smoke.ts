import { strict as assert } from "assert";

const plugin = require("../plugins/interface/FreezeTimer.plugin.js");
let loginHandler: any;
let processHandler: any;
let hitHandler: any;
plugin.register({
  onCombatHitResolved: (handler: any) => { hitHandler = handler; },
  onPlayerLogin: (handler: any) => { loginHandler = handler; },
  onPlayerProcess: (handler: any) => { processHandler = handler; },
  onPlayerLogout: () => {},
});

let ticks = 0;
const updates: Array<[number, number]> = [];
const player = {
  isPlayer: () => true,
  getTimers: () => ({ getTicks: () => ticks }),
  getPacketSender: () => ({ sendConfig: (id: number, value: number) => updates.push([id, value]) }),
};
loginHandler({ player });
assert.deepEqual(updates, [[7998, 0], [7999, 0]]);
ticks = 8;
hitHandler({ target: player, attacker: { getCombat: () => ({ getPreviousCast: () => ({ spellId: () => 12891 }) }) } });
processHandler({ player });
assert.deepEqual(updates.slice(-2), [[7998, 5], [7999, 12891]]);
console.log("freeze timer plugin smoke test passed");

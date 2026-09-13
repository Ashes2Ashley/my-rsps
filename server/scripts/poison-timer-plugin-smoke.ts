import { strict as assert } from "assert";

const plugin = require("../plugins/interface/PoisonTimer.plugin.js");
let loginHandler: any;
let processHandler: any;
plugin.register({
  onPlayerLogin: (handler: any) => { loginHandler = handler; },
  onPlayerProcess: (handler: any) => { processHandler = handler; },
  onPlayerLogout: () => {},
});

let damage = 30;
let venom = false;
const updates: Array<[number, number]> = [];
const player = {
  getPoisonDamage: () => damage,
  isVenomed: () => venom,
  getPacketSender: () => ({ sendConfig: (id: number, value: number) => updates.push([id, value]) }),
};
loginHandler({ player });
assert.deepEqual(updates, [[7996, 540], [7997, 1]]);
processHandler({ player });
assert.equal(updates.length, 2);
venom = true;
processHandler({ player });
assert.deepEqual(updates.slice(-2), [[7996, -1], [7997, 2]]);
console.log("poison timer plugin smoke test passed");

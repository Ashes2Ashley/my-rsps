const fs = require("fs");
const path = require("path");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");

const CLICK_FIELDS = ["firstClick", "secondClick", "thirdClick", "fourthClick"];

function shopkeepers() {
  const file = path.join(GameConstants.DEFINITIONS_DIRECTORY, "shops.json");
  const shops = JSON.parse(fs.readFileSync(file, "utf8"));
  const bindings = new Map();

  for (const shop of shops) {
    for (const trader of shop?.npcInteractions ?? []) {
      const slot = Number(trader?.optionSlot);
      if (!Number.isInteger(slot) || slot < 1 || slot > CLICK_FIELDS.length) continue;
      for (const npcId of trader?.npcIds ?? []) {
        if (!Number.isInteger(npcId) || npcId < 0) continue;
        const key = `${npcId}:${slot}`;
        const previous = bindings.get(key);
        bindings.set(key, previous === undefined ? shop.id : previous === shop.id ? previous : null);
      }
    }
  }
  return bindings;
}

module.exports = {
  name: "Shopkeepers",
  register(api) {
    for (const [key, shopId] of shopkeepers()) {
      if (shopId === null) continue;
      const [npcId, slot] = key.split(":").map(Number);
      api.registerNpcInteraction(npcId, { [CLICK_FIELDS[slot - 1]]: { shopId } });
    }
  },
};

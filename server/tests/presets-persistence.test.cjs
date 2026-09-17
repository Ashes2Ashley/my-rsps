const assert = require("node:assert/strict");
const { test } = require("node:test");

const { Server } = require("../dist/Server");
Server.installProductionPathResolver();

const { MagicSpellbook } = require("../dist/game/model/MagicSpellbook");
const { GROUP_ID, GLOBAL_ROW_COUNT, PRESET_ROW_START, uid } = require("../plugins/modes/pvp/presetsWidget");
const presets = require("../plugins/modes/pvp/Presets");

function playerWithAttributes(attributes = new Map()) {
  const strings = [];
  const sender = {
    sendString(value) {
      strings.push(value);
      return sender;
    },
    sendItemOnInterfaces() { return sender; },
    sendInterfaceDisplayState() { return sender; },
    sendEnterInputPrompt() { return sender; },
  };
  let currentPreset = null;
  let syntaxAction = null;
  const player = {
    getAttribute: (key) => attributes.get(key),
    setAttribute: (key, value) => attributes.set(key, value),
    getInterfaceId: () => GROUP_ID,
    getPacketSender: () => sender,
    sendMessage: (message) => sender.sendMessage(message),
    getCurrentPreset: () => currentPreset,
    setCurrentPreset: (preset) => { currentPreset = preset; },
    setEnteredSyntaxAction: (action) => { syntaxAction = action; },
    getEnteredSyntaxAction: () => syntaxAction,
    getInventory: () => ({ copyValidItemsArray: () => [] }),
    getEquipment: () => ({ copyValidItemsArray: () => [] }),
    getSkillManager: () => ({ getMaxLevel: () => 99 }),
    getSpellbook: () => MagicSpellbook.NORMAL,
    getCombat: () => ({ getAutocastSpell: () => null }),
    isPlayerBot: () => false,
  };
  return { attributes, player, strings };
}

test("custom presets rehydrate from their persisted attribute", () => {
  let onButton;
  const persisted = [];
  presets.register({
    getPrayerHandler: () => ({}),
    getCombatFactory: () => ({}),
    getSkillManager: () => ({}),
    persistAttribute: (key) => persisted.push(key),
    registerCustomInterface() {},
    onInterfaceActionButton(_buttons, handler) { onButton = handler; },
  });
  assert.deepEqual(persisted, ["pvp:customPresets"]);

  const customSlot = uid(PRESET_ROW_START + GLOBAL_ROW_COUNT);
  const source = playerWithAttributes();
  onButton({ player: source.player, buttonId: customSlot });
  source.player.getEnteredSyntaxAction().execute("saved build");

  const stored = source.attributes.get("pvp:customPresets");
  assert.equal(stored[0].name, "Saved Build");
  assert.equal(typeof stored[0].getName, "undefined");

  const restored = playerWithAttributes(new Map([
    ["pvp:customPresets", JSON.parse(JSON.stringify(stored))],
  ]));
  onButton({ player: restored.player, buttonId: customSlot });
  assert.equal(restored.player.getCurrentPreset().getName(), "Saved Build");
  assert.ok(restored.strings.includes("<col=ffffff>Saved Build</col>"));
});

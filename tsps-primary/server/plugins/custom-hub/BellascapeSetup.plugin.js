const fs = require("node:fs");
const path = require("node:path");
const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const Presets = require("../modes/pvp/Presets");

const CONFIG_PATH = path.join(__dirname, "../../data/definitions/BellascapeGameplay.json");
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const LOADOUT_ATTRIBUTE = CONFIG.persistence.selectedLoadoutAttribute;
const ZONE_ATTRIBUTE = CONFIG.persistence.selectedZoneAttribute;

function keyFromParts(parts) {
  return String(parts?.join("-") ?? "").trim().toLowerCase();
}
function sendLoadouts(player) {
  player.sendMessage("Bellascape loadouts:");
  for (const [key, setup] of Object.entries(CONFIG.loadouts)) {
    player.sendMessage(`::setup ${key} - ${setup.label}`);
  }
  player.sendMessage("Use ::presets for the full preset interface.");
}
function applyLoadout(player, key) {
  const setup = CONFIG.loadouts[key];
  if (!setup) {
    sendLoadouts(player);
    return false;
  }
  const preset = Presets.getGlobalPresetByName(setup.preset);
  if (!preset || !Presets.applyPreset(player, preset)) {
    player.sendMessage(`The ${setup.label} setup could not be applied here.`);
    return false;
  }
  player.setAttribute(LOADOUT_ATTRIBUTE, key);
  player.sendMessage(`${setup.label} equipped. Spellbook: ${preset.getSpellbook?.() ?? "configured"}.`);
  return true;
}
function moveToZone(player, name) {
  const zone = CONFIG.zones[name];
  if (!zone) return false;
  player.moveTo(new Location(zone.x, zone.y, zone.z));
  player.setAttribute(ZONE_ATTRIBUTE, name);
  player.sendMessage(`${zone.label}: ${name === "danger" ? "PvP is active; risk your items." : "safe area."}`);
  return true;
}
module.exports = {
  name: "BellascapeSetup",
  register(api) {
    api.persistAttribute(LOADOUT_ATTRIBUTE);
    api.persistAttribute(ZONE_ATTRIBUTE);
    api.registerCommand("setup", ({ player, parts }) => {
      const key = keyFromParts(parts);
      if (!key || key === "list") return sendLoadouts(player);
      applyLoadout(player, key);
    });
    api.registerCommand("loadout", ({ player, parts }) => {
      const key = keyFromParts(parts);
      if (!key || key === "list") return sendLoadouts(player);
      applyLoadout(player, key);
    });
    api.registerCommand("safe", ({ player }) => moveToZone(player, "safe"));
    api.registerCommand("danger", ({ player }) => moveToZone(player, "danger"));
    api.registerCommand("train", ({ player }) => moveToZone(player, "training"));
    api.onPlayerLogin(({ player }) => {
      const saved = player.getAttribute(LOADOUT_ATTRIBUTE);
      player.sendMessage("Welcome to Bellascape PK. Choose a setup with ::setup list, then use ::safe, ::danger, or ::train.");
      if (saved && CONFIG.loadouts[saved]) {
        applyLoadout(player, saved);
      }
    });
  },
};

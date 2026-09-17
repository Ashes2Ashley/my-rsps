/**
 * Exact-name Talk-to dialogues from data/definitions/npc-dialogues.json.
 * Copy fresh exports from osrsreboxed-db; each record's default selects the variant.
 * Speech, choices, random alternatives and named shops run through existing systems.
 * Prose conditions/effects and unresolved references stop safely pending structured data.
 */
const fs = require("fs");
const path = require("path");
const { GameConstants } = require("../../src/main/typescript/elvarg/game/GameConstants");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { DialogueChainBuilder } = require("../../src/main/typescript/elvarg/game/model/dialogues/builders/DialogueChainBuilder");
const { NpcDialogue } = require("../../src/main/typescript/elvarg/game/model/dialogues/entries/impl/NpcDialogue");
const { PlayerDialogue } = require("../../src/main/typescript/elvarg/game/model/dialogues/entries/impl/PlayerDialogue");
const { ActionDialogue } = require("../../src/main/typescript/elvarg/game/model/dialogues/entries/impl/ActionDialogue");
const { ShopDefinition } = require("../../src/main/typescript/elvarg/game/definition/ShopDefinition");
const { ShopManager } = require("../../src/main/typescript/elvarg/game/model/container/shop/ShopManager");

// These NPCs have executable plugin conversations, not an imported prose transcript.
const SPECIAL_NPC_DIALOGUES = new Set(["Skully"]);

function startDialogue(api, event, steps, branches = {}) {
  const { player } = event;
  const manager = player.getDialogueManager();
  const close = () => player.getPacketSender().sendInterfaceRemoval();
  const unavailable = () => {
    close();
    player.sendMessage("That conversation isn't available right now.");
  };

  function choices(step, rest, offset = 0) {
    const options = step.options || [];
    const more = options.length - offset > 5;
    const visible = options.slice(offset, offset + (more ? 4 : 5));
    const pairs = visible.flatMap((option) => [option.text, () => {
      if (option.condition || option.hook) return unavailable();
      run([...(option.steps || []), ...rest]);
    }]);
    if (more) pairs.push("More...", () => choices(step, rest, offset + 4));
    // The existing prompt requires at least two buttons; keep a single choice selectable.
    if (visible.length === 1) pairs.push("Goodbye.", close);
    if (!pairs.length) return close();
    manager.reset();
    if (!api.sendMultiChatboxPrompt(player, step.prompt || "Select an Option", ...pairs)) {
      unavailable();
    }
  }

  function run(queue) {
    const chain = new DialogueChainBuilder();
    let index = 0;
    for (let position = 0; position < queue.length; position++) {
      const step = queue[position];
      const rest = [...(step.steps || []), ...queue.slice(position + 1)];
      const namedNpc = step.type === "line" && step.speaker === event.definition.getName();
      if (!step.hook && (typeof step.npc === "string" || typeof step.player === "string" || namedNpc)) {
        const isPlayer = typeof step.player === "string";
        // NPC chatboxes show four wrapped lines. Split long source lines instead of truncating.
        const lines = Misc.wrapText(isPlayer ? step.player : namedNpc ? step.text : step.npc, 53);
        for (let start = 0; start < lines.length; start += 4) {
          const text = lines.slice(start, start + 4).join(" ");
          chain.add(isPlayer
            ? new PlayerDialogue(index++, text)
            : new NpcDialogue(index++, event.definition.getId(), text));
        }
        if (step.steps?.length) {
          chain.add(new ActionDialogue(index++, { execute: () => run(rest) }));
          manager.startDialogues(chain);
          return;
        }
        continue;
      }
      chain.add(new ActionDialogue(index++, { execute: () => {
        if (step.hook) return unavailable();
        if (step.type === "end") return close();
        if (step.type === "call" && Object.hasOwn(branches, step.branch) && Array.isArray(branches[step.branch])) {
          return run([...branches[step.branch], ...rest]);
        }
        if (step.type === "choice") return choices(step, rest);
        if (step.type === "random" && step.options?.length) {
          const option = step.options[Math.floor(Math.random() * step.options.length)];
          if (option.condition || option.hook) return unavailable();
          return run([...(option.steps || []), ...rest]);
        }
        if (step.type === "action" && step.action === "open_shop") {
          const target = step.target;
          const shops = ShopDefinition.all().filter((shop) => shop.getName() === target);
          if (shops.length === 1) {
            close();
            if (ShopManager.open(player, shops[0].getId(), true)) return;
          }
        }
        // ponytail: prose conditions, effects and unresolved jumps have no executable contract.
        // Stop here; add structured conditions/actions to the data before implementing them.
        unavailable();
      } }));
      manager.startDialogues(chain);
      return;
    }
    chain.add(new ActionDialogue(index, { execute: close }));
    manager.startDialogues(chain);
  }
  run(steps);
}

module.exports = {
  name: "NpcDialogues",
  register(api) {
    const file = path.join(GameConstants.DEFINITIONS_DIRECTORY, "npc-dialogues.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`${file}: expected dialogues keyed by transcript name`);
    }
    for (const [name, npc] of Object.entries(data)) {
      if (npc.default === null) continue;
      const variant = npc.steps ?? npc.variants?.[npc.default];
      if (!Array.isArray(variant)) {
        throw new Error(`${file}: invalid default dialogue for ${name}`);
      }
    }
    api.onAnyNpcInteraction({
      "Talk-to": (event) => {
        const name = event.definition.getName();
        if (SPECIAL_NPC_DIALOGUES.has(name)) return false;
        const npc = Object.hasOwn(data, name) ? data[name] : undefined;
        const variant = npc?.steps ?? npc?.variants?.[npc.default];
        startDialogue(api, event, variant?.length ? variant : [
          { npc: "Sorry, i've nothing interesting to talk about yet" },
        ], npc?.branches);
        return true;
      },
    });
  },
};

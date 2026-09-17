const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");

const MIN_LEVEL = 1;
const MAX_LEVEL = 99;

function isDeveloper(player) {
  return player?.getRights?.()?.getId?.() === 4;
}

function isValidLevel(value) {
  return Number.isInteger(value) && value >= MIN_LEVEL && value <= MAX_LEVEL;
}

function handleSkillClick(player, buttonId) {
  const numericButtonId = Number(buttonId);
  if (!Number.isInteger(numericButtonId)) {
    return false;
  }

  const skill = Skill.forButton(numericButtonId);
  if (!skill) {
    return false;
  }

  if (!isDeveloper(player)) {
    player
      ?.getPacketSender?.()
      ?.sendMessage?.("Setting skill levels requires DEVELOPER rights.");
    return true;
  }

  player.getPacketSender().sendInterfaceRemoval();
  player.setEnteredAmountAction({
    execute: (amount) => {
      const level = Number(amount);
      if (!isValidLevel(level)) {
        player
          .sendMessage(`Invalid level. Please enter a level from ${MIN_LEVEL} to ${MAX_LEVEL}.`);
        return;
      }
      player.getSkillManager().setLevel(skill, level);
    },
  });
  player
    .getPacketSender()
    .sendEnterAmountPrompt(`Enter desired level (${MIN_LEVEL}-${MAX_LEVEL}).`);

  return true;
}

module.exports = {
  name: "DeveloperSetSkillLevel",
  register(api) {
    api.onButtonClick((event) => {
      if (handleSkillClick(event.player, event.buttonId)) {
        event.handled = true;
      }
    });

    api.onInterfaceActionClick((event) => {
      if (handleSkillClick(event.player, event.buttonId)) {
        event.handled = true;
      }
    });
  },
};

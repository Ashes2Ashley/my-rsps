const { Skill } = require("../../src/main/typescript/elvarg/game/model/Skill");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");

const TURAEL_MASTER = Object.freeze({
  name: "Turael",
  basePoints: 1,
  consecutiveTaskPoints: [
    [10, 3],
    [50, 10],
    [100, 25],
    [250, 50],
    [1000, 75],
  ],
});

const TASKS = Object.freeze([
  { name: "banshees", hint: "in the Slayer Tower", min: 15, max: 50, slayerLevel: 15, weight: 8, npcNames: ["banshee", "twisted banshee"] },
  { name: "bats", hint: "in the Taverly Dungeon", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["bat", "giant bat"] },
  { name: "chickens", hint: "in Lumbridge", min: 15, max: 50, slayerLevel: 1, weight: 6, npcNames: ["chicken", "mounted terrorbird gnome", "terrorbird", "rooster"] },
  { name: "bears", hint: "outside Varrock", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["black bear", "grizzly bear", "grizzly bear cub", "bear cub", "callisto"] },
  { name: "cave bugs", hint: "Lumbridge dungeon", min: 10, max: 20, slayerLevel: 7, weight: 8, npcNames: ["cave bug"] },
  { name: "cave crawlers", hint: "Lumbridge dungeon", min: 15, max: 50, slayerLevel: 10, weight: 8, npcNames: ["cave crawler"] },
  { name: "cave slime", hint: "Lumbridge dungeon", min: 10, max: 20, slayerLevel: 17, weight: 8, npcNames: ["cave slime"] },
  { name: "cows", hint: "Lumbridge", min: 15, max: 50, slayerLevel: 1, weight: 8, npcNames: ["cow", "cow calf"] },
  { name: "crawling hands", hint: "in the Slayer Tower", min: 15, max: 50, slayerLevel: 5, weight: 8, npcNames: ["crawling hand"] },
  { name: "desert lizards", hint: "in the desert", min: 15, max: 50, slayerLevel: 22, weight: 8, npcNames: ["lizard", "small lizard", "desert lizard"] },
  { name: "dogs", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["dog", "jackal", "guard dog", "wild dog"] },
  { name: "dwarves", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["dwarf", "dwarf gang member", "chaos dwarf"] },
  { name: "ghosts", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["ghost", "tortured soul"] },
  { name: "goblins", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["goblin", "cave goblin guard"] },
  { name: "icefiends", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 8, npcNames: ["icefiend"] },
  { name: "kalphites", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 6, npcNames: ["kalphite worker", "kalphite soldier", "kalphite guardian", "kalphite queen"] },
  { name: "minotaurs", hint: "", min: 10, max: 20, slayerLevel: 1, weight: 7, npcNames: ["minotaur"] },
  { name: "monkeys", hint: "", min: 10, max: 20, slayerLevel: 1, weight: 7, npcNames: ["monkey", "karmjan monkey", "monkey guard", "monkey archer", "zombie monkey"] },
  { name: "rats", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["rat", "giant rat", "dungeon rat", "brine rat"] },
  { name: "scorpions", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["scorpion", "king scorpion", "poison scorpion", "pit scorpion", "scorpia"] },
  { name: "skeletons", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["skeleton", "skeleton mage", "vet'ion"] },
  { name: "spiders", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 6, npcNames: ["spider", "giant spider", "shadow spider", "giant crypt spider", "venenatis"] },
  { name: "wolves", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["wolf", "white wolf", "big wolf"] },
  { name: "zombies", hint: "", min: 15, max: 50, slayerLevel: 1, weight: 7, npcNames: ["zombie", "undead one"] },
]);

function initializePlayerSlayerState(player) {
  if (typeof player.getSlayerPoints === "function" && !Number.isFinite(player.getSlayerPoints())) {
    player.setSlayerPoints(0);
  }
  if (typeof player.getConsecutiveTasks === "function" && !Number.isFinite(player.getConsecutiveTasks())) {
    player.setConsecutiveTasks(0);
  }
}

function wrapTask(taskData) {
  return {
    ...taskData,
    getHint() {
      return this.hint;
    },
    getNpcNames() {
      return this.npcNames;
    },
    toString() {
      return this.name;
    },
  };
}

function wrapMaster(masterData) {
  return {
    ...masterData,
    getBasePoints() {
      return this.basePoints;
    },
    getConsecutiveTaskPoints() {
      return this.consecutiveTaskPoints;
    },
  };
}

function wrapActiveTask(master, task, remaining) {
  return {
    master,
    task,
    remaining,
    getMaster() {
      return this.master;
    },
    getTask() {
      return this.task;
    },
    getRemaining() {
      return this.remaining;
    },
    setRemaining(value) {
      this.remaining = value;
    },
  };
}

function assignTask(player) {
  if (player.getSlayerTask()) {
    player
      .getPacketSender()
      .sendInterfaceRemoval()
      .sendMessage("You already have a Slayer task.");
    return false;
  }

  const slayerLevel = player.getSkillManager().getMaxLevel(Skill.SLAYER);
  const possibleTasks = TASKS.filter((task) => slayerLevel >= task.slayerLevel);
  if (possibleTasks.length === 0) {
    player
      .getPacketSender()
      .sendInterfaceRemoval()
      .sendMessage(
        "Nieve was unable to give you a Slayer task. Please try again later."
      );
    return false;
  }

  Misc.randomElements(possibleTasks);
  const totalWeight = possibleTasks.reduce((sum, task) => sum + task.weight, 0);
  let selected = possibleTasks[0];
  for (const task of possibleTasks) {
    if (Misc.getRandom(totalWeight) <= task.weight) {
      selected = task;
      break;
    }
  }

  const remaining = Misc.randomInclusive(selected.min, selected.max);
  player.setSlayerTask(
    wrapActiveTask(wrapMaster(TURAEL_MASTER), wrapTask(selected), remaining)
  );
  return true;
}

function onNpcKilled(player, npc) {
  const task = player.getSlayerTask();
  if (!task) {
    return;
  }

  const npcName = npc?.getDefinition?.()?.getName?.();
  if (!npcName) {
    return;
  }
  const normalized = npcName.toLowerCase();
  const isTaskNpc = task
    .getTask()
    .getNpcNames()
    .some((name) => name === normalized);
  if (!isTaskNpc) {
    return;
  }

  player
    .getSkillManager()
    .addExperiences(Skill.SLAYER, npc.getDefinition().getHitpoints());
  task.setRemaining(task.getRemaining() - 1);

  if (task.getRemaining() > 0) {
    return;
  }

  let rewardPoints = task.getMaster().getBasePoints();
  player.setConsecutiveTasks(player.getConsecutiveTasks() + 1);

  for (const [requiredTasks, bonusPoints] of task.getMaster().getConsecutiveTaskPoints()) {
    if (player.getConsecutiveTasks() % requiredTasks === 0) {
      rewardPoints = bonusPoints;
      break;
    }
  }

  player.setSlayerPoints(player.getSlayerPoints() + rewardPoints);
  player.sendMessage(
    `You have succesfully completed @dre@${player.getConsecutiveTasks()}@bla@ slayer tasks in a row.`
  );
  player.sendMessage(
    `You earned @dre@${rewardPoints}@bla@ Slayer ${
      rewardPoints === 1 ? "point" : "points"
    }, your new total is now @dre@${player.getSlayerPoints()}.`
  );
  player.setSlayerTask(null);
}

module.exports = {
  name: "Slayer",
  register(api) {
    api.onPlayerLogin(({ player }) => {
      initializePlayerSlayerState(player);
    });

    api.onSlayerAssignRequest((player) => assignTask(player));

    api.onNpcDeath(({ killer, npc }) => {
      if (!killer || !killer.isPlayer?.()) {
        return;
      }
      onNpcKilled(killer, npc);
    });

    api.log("registered", { tasks: TASKS.length });
  },
};

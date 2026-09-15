const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");

let pluginApi;

function climbUp({ player, location }) {
  if (location.x !== 3097 || location.y !== 9867 || location.z !== 0) return false;
  pluginApi.emitCustomEvent("ladders:climbUp", {
    player,
    destination: new Location(3096, 3468),
  });
}

function openTrapdoor({ player, location }) {
  if (location.x !== 3097 || location.y !== 3468 || location.z !== 0) return false;
  pluginApi.emitCustomEvent("ladders:climbDown", {
    player,
    destination: new Location(3096, 9867),
  });
}

module.exports = {
  name: "Edgeville",
  register(api) {
    pluginApi = api;
    api.onObjectInteraction("Ladder", { "Climb-up": climbUp });
    api.onObjectInteraction("Trapdoor", { Open: openTrapdoor });
  },
};

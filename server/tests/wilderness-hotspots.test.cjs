// Run after `yarn build`: node --test tests/wilderness-hotspots.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { Server } = require('../dist/Server');
Server.installProductionPathResolver();
const { Location } = require('../dist/game/model/Location');
const { PathFinder } = require('../dist/game/model/movement/path/PathFinder');
const { createBotRegistry } = require('../plugins/bots/runtime/BotRegistry');
const assignment = require('../plugins/bots/behaviours/pvp/PvpAssignment');
const { getEnabledWildernessHotspots, hotspotContainsLocation, isOutsideWildernessHotspots } =
  require('../plugins/bots/behaviours/pvp/WildernessHotspotRegistry');
const { RoamingBehavior } = require('../plugins/bots/behaviours/modes/RoamingBehavior');
const { chooseNextTarget, requestMovement, peekMovementRequest, dispatchMovementRequest } =
  require('../plugins/bots/behaviours/navigation/BotNavigation');

test('hotspot populations stay dedicated; regional spawn/respawn and routes exclude every hotspot', () => {
  const hotspots = getEnabledWildernessHotspots();
  // Execute the boot callback itself so a death-time reassignment regression is caught.
  const boot = fs.readFileSync(require.resolve('../plugins/bots/runtime/BotPluginBoot'), 'utf8');
  const callbackStart = boot.indexOf('handlePersistentPvpRespawn:');
  const callbackEnd = boot.indexOf('\n      })', callbackStart);
  const { handlePersistentPvpRespawn } = vm.runInNewContext(
    `({${boot.slice(callbackStart, callbackEnd)}})`, {
      ...assignment, config: {}, isPvpOnlyBotState: () => true,
      applyGeneratedPvpLoadout() {}, botApi: { log() {} }, randomInRange: (min) => min,
    }
  );
  const regions = [...new Map(hotspots.map(({ anchor }) => {
    const regionX = anchor.x >> 6, regionY = anchor.y >> 6;
    const key = `${anchor.z}:${regionX}:${regionY}`;
    return [key, { key, regionX, regionY, z: anchor.z }];
  })).values()];
  const makeRegistry = (blocked) => createBotRegistry({
    botApi: { getRegionManager: () => ({ blocked }), log() {} },
    botCount: 0, wildernessRoamerBotCount: 1000, wildernessActiveRegionBotsPerRegion: 120,
    spawn: new Location(3100, 3550, 0), behaviorMode: { PVP: 'pvp' },
    createBotPlayer(username, initial) {
      let location = initial;
      return { getUsername: () => username, getLocation: () => location,
        moveTo: (next) => { location = next; } };
    },
    createInitialState: (home) => ({ home, roaming: {}, pvp: {}, autonomy: {} }),
    ...assignment,
    createController() {}, ensureBehaviorTaskStarted() {}, emitPlayerLogin() {},
    worldGetPlayerByName: () => null,
    randomInRange: (min, max) => Math.floor((min + max) / 2),
    getActiveRegionSnapshot: () => ({ regions, radius: 0 }),
  });
  const registry = makeRegistry(() => false);
  registry.spawnConfiguredBots();
  const regular = registry.entries.filter(({ state }) => !state.pvp.hotspotId);
  assert.ok(regular.length > 0, 'ordinary bots still populate the surrounding regions');
  for (const { player } of regular) {
    assert.ok(isOutsideWildernessHotspots(player.getLocation()));
    assert.ok(isOutsideWildernessHotspots(player.__botResolveRespawnLocation()));
  }
  const roaming = new RoamingBehavior(new Map(), { botWalkRadius: 12 });
  for (const hotspot of hotspots) {
    const residents = registry.entries.filter(({ state }) => state.pvp.hotspotId === hotspot.id);
    assert.equal(residents.length, Math.min(hotspot.targetBots, hotspot.maxBots));
    for (const { player, state } of residents) {
      assert.ok(hotspotContainsLocation(hotspot, player.getLocation()));
      assert.ok(hotspotContainsLocation(hotspot, player.__botResolveRespawnLocation()));
      assert.ok(hotspot.allowedLoadouts.includes(state.pvp.loadoutId));
      assert.equal(roaming.getAssignedHotspot(state), hotspot);
      assert.ok(chooseNextTarget(player, state, 12, { bounds: hotspot.area }),
        'dedicated bots can still choose targets inside their own hotspot');
      assert.equal(handlePersistentPvpRespawn({ player, state }, 1000), true);
      assert.equal(state.pvp.hotspotId, hotspot.id);
      assert.ok(hotspot.allowedLoadouts.includes(state.pvp.loadoutId));
    }
    // Even an incompatible configured weight table must not leak members gear.
    const metadata = assignment.buildHotspotPvpMetadata({
      hotspotId: hotspot.id, config: { pvp: { loadoutWeights: ['f2p_strength_pure'] } },
    });
    assert.ok(hotspot.allowedLoadouts.includes(metadata.loadoutId));
  }
  const blockedRegistry = makeRegistry(() => true);
  blockedRegistry.spawnConfiguredBots();
  assert.equal(blockedRegistry.entries.length, 0, 'no unchecked corner fallback when no tile is valid');

  const originalRoute = PathFinder.calculateRoute;
  try {
    for (const hotspot of hotspots) {
      const { minX, maxX, minY, z } = hotspot.area;
      const location = new Location(minX - 1, minY, z);
      let points = [];
      const queue = { pointsReturn: () => points, reset: () => { points = []; } };
      const player = { getLocation: () => location, getMovementQueue: () => queue,
        getUpdateFlag: () => ({ flag() {} }) };
      const state = { home: hotspot.anchor, roaming: {}, pvp: { hotspotId: null },
        autonomy: { allowedAutonomousModes: ['pvp'] } };
      assert.equal(chooseNextTarget(player, state, 0, { bounds: hotspot.area }), null);
      PathFinder.calculateRoute = () => {
        points = [{ position: new Location(maxX + 1, minY, z) }];
        return 1;
      };
      requestMovement(player, maxX + 1, minY, { state });
      assert.equal(dispatchMovementRequest(player, peekMovementRequest(player)).hasRoute, false,
        'outside-to-outside path crossing a hotspot is rejected');
      assert.equal(points.length, 0);
      assert.equal(peekMovementRequest(player), null);
      location.setY(hotspot.area.maxY + 20);
      PathFinder.calculateRoute = () => {
        points = [{ position: new Location(minX - 1, location.getY() + 1, z) }];
        return 1;
      };
      requestMovement(player, minX - 1, location.getY() + 1, { state });
      assert.equal(dispatchMovementRequest(player, peekMovementRequest(player)).hasRoute, true);
    }
  } finally {
    PathFinder.calculateRoute = originalRoute;
  }
});

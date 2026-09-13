// Run after `yarn build`: node --test tests/pvp-retreat.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const { Server } = require('../dist/Server');
Server.installProductionPathResolver();
const { Location } = require('../dist/game/model/Location');
const { Player } = require('../dist/game/entity/impl/player/Player');
const { TeleportHandler } = require('../dist/game/model/teleportation/TeleportHandler');
const { Wilderness } = require('../dist/game/content/wilderness/Wilderness');
const filename = path.resolve(__dirname, '../plugins/bots/behaviours/nodes/pvp/PvpDefensiveActionNode.js');
const localRequire = createRequire(filename);

test('PvP retreat respects depth, teleblock, freezes and replenishes only after arrival', () => {
  let routes = [], teleports = [], loads = 0, blocked = false, frozen = false;
  let allowed = true, hp = 10, teleporting = false, retaliate = true;
  let location = new Location(3100, 3600, 0), target = {}, attacker = { getLocation: () => new Location(3100, 3601, 0) };
  const originalCheck = TeleportHandler.checkReqs;
  const originalTeleport = TeleportHandler.teleport;
  const originalIsIn = Wilderness.isIn;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, require: (name) => {
      if (name.endsWith('/BotNavigation')) return {
        queueRouteAndFlagAppearance: (_, x, y) => routes.push({ x, y }),
        clearMovementRequest: () => {},
      };
      if (name.endsWith('/PvpLoadoutPolicy')) return {
        applyGeneratedPvpLoadout: () => { loads++; hp = 99; return true; },
      };
      return localRequire(name);
    },
  }, { filename });
  const combat = {
    getTarget: () => target, reset: () => { target = null; },
    getAttacker: () => attacker, setUnderAttack: (value) => { attacker = value; },
    getTeleblockTimer: () => ({ finished: () => !blocked }),
  };
  const player = {
    getHitpoints: () => hp, getSkillManager: () => ({ getMaxLevel: () => 99 }),
    autoRetaliateReturn: () => retaliate, setAutoRetaliate: (value) => { retaliate = value; },
    getCombat: () => combat, getLocation: () => location,
    get isTeleporting() { return teleporting; },
    isTeleportingReturn: Player.prototype.isTeleportingReturn, isDyingReturn: () => false,
    getForceMovement: () => null, setFollowing: () => {}, setCombatFollowing: () => {},
    getTimers: () => ({ has: () => frozen }),
    getMovementQueue: () => ({ reset: () => {}, isMovementBlocked: () => false }),
    setRunning: () => {}, getRunEnergy: () => 100,
  };
  let profile = 'elite';
  const state = { home: { x: 3100, y: 3550, z: 0 }, pvp: { escapeThreshold: 0.2 } };
  const node = new module.exports.PvpDefensiveActionNode({
    setPhase: (state, phase) => { state.pvp.phase = phase; },
    getProfile: () => ({ id: profile }), stopPvp: () => {},
  });
  const tick = () => node.tick({ player, state, nowMs: 1000, target: null });
  try {
    Wilderness.isIn = () => true;
    TeleportHandler.checkReqs = () => allowed;
    TeleportHandler.teleport = (_, destination) => { teleports.push(destination); teleporting = true; };
    tick();
    assert.equal(teleports.length, 1, 'elite escapes during combat below level 20');
    assert.equal(retaliate, false);
    assert.equal(loads, 0);
    tick();
    assert.equal(teleports.length, 1, 'do not restart an active teleport');
    location = teleports[0]; teleporting = false;
    tick();
    assert.equal(loads, 1);
    assert.equal(state.pvp.retreat, null);
    assert.equal(retaliate, true);
    assert.equal(hp, 99);

    hp = 10; attacker = { getLocation: () => new Location(3100, 3601, 0) }; location = new Location(3100, 3680, 0);
    tick();
    assert.equal(teleports.length, 1, 'level 21 cannot teleport');
    assert.ok(routes.at(-1).y < location.getY(), 'deep Wilderness retreat goes south');
    location = new Location(3100, 3679, 0); blocked = true;
    tick();
    assert.equal(teleports.length, 1, 'teleblock prevents teleport at level 20');
    const routeCount = routes.length; frozen = true;
    tick();
    assert.equal(routes.length, routeCount, 'freeze prevents retreat movement');
    blocked = false; allowed = false;
    tick();
    assert.equal(teleports.length, 1, 'normal teleport veto is respected');
    allowed = true;
    tick();
    assert.equal(teleports.length, 2, 'freeze alone does not prevent teleport at level 20');

    teleporting = false; state.pvp.retreat = null; frozen = false; retaliate = true;
    profile = 'novice'; attacker = { getLocation: () => new Location(3100, 3601, 0) }; location = new Location(3100, 3600, 0);
    tick();
    assert.equal(teleports.length, 2, 'novice runs while under attack');
    hp = 90;
    tick();
    assert.ok(state.pvp.retreat, 'eating does not cancel an escape');
    location = new Location(3100, 3525, 0);
    tick();
    assert.equal(routes.at(-1).y, 3525, 'retreat stays north of the ditch');
    assert.notEqual(routes.at(-1).x, location.getX(), 'flee along the ditch');
    blocked = true;
    attacker = null;
    tick();
    assert.deepEqual(routes.at(-1), { x: state.home.x, y: state.home.y }, 'walk home after combat while teleblocked');
    assert.equal(teleports.length, 2);
    location = new Location(state.home.x, state.home.y, 0);
    tick();
    assert.equal(loads, 2, 'walking home also replenishes the bot');
    assert.equal(state.pvp.retreat, null);
    assert.equal(retaliate, true);

    hp = 10; blocked = false; location = new Location(3100, 3600, 0);
    attacker = null;
    tick();
    assert.equal(teleports.length, 3, 'novice returns home after disengaging');
  } finally {
    TeleportHandler.checkReqs = originalCheck;
    TeleportHandler.teleport = originalTeleport;
    Wilderness.isIn = originalIsIn;
  }
});

test('retreat blocks southbound ditch crossings, including queued crossings, but allows returning north', () => {
  const { DitchTraversalService } = require('../plugins/bots/behaviours/traversal/DitchTraversalService');
  let location = new Location(3100, 3525, 0), pending, crossings = 0;
  const player = {
    getLocation: () => location, getUsername: () => 'retreat-test', setPositionToFace: () => {},
    getMovementQueue: () => ({ walkToObject: (_, action) => { pending = action; }, reset: () => {} }),
  };
  const state = { pvp: { retreat: {} }, roaming: { target: { x: 3100, y: 3518, z: 0 } } };
  const ditch = { getLocation: () => new Location(3100, 3521, 0), getId: () => 23271 };
  const service = new DitchTraversalService({
    api: { log: () => {} }, options: { ditchAttemptCooldownMs: 0 },
    emitObjectInteraction: () => { crossings++; return true; },
  });
  assert.equal(service.requestCross(player, state, ditch), false);
  assert.equal(pending, undefined);
  state.pvp.retreat = null;
  assert.equal(service.requestCross(player, state, ditch), true);
  state.pvp.retreat = {};
  pending.execute();
  assert.equal(crossings, 0, 'queued southbound crossing is cancelled when retreat begins');
  location = new Location(3100, 3518, 0);
  state.roaming.target.y = 3550;
  assert.equal(service.requestCross(player, state, ditch), true);
  pending.execute();
  assert.equal(crossings, 1, 'returning to the Wilderness is allowed');
});

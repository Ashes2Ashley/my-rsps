import assert = require("assert");
import { FightType } from "../src/main/typescript/elvarg/game/content/combat/FightType";
import { WeaponProfiles } from "../src/main/typescript/elvarg/game/content/combat/WeaponProfile";
import { WeaponInterfaces } from "../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces";
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { ObjectDefinition } from "../src/main/typescript/elvarg/game/definition/ObjectDefinition";
import { MapObjects } from "../src/main/typescript/elvarg/game/entity/impl/object/MapObjects";
import { ObjectActionPacketListener } from "../src/main/typescript/elvarg/net/packet/impl/ObjectActionPacketListener";
import { PluginManager } from "../src/main/typescript/elvarg/plugins/PluginManager";
import { RegionManager } from "../src/main/typescript/elvarg/game/collision/RegionManager";
import { GameObject } from "../src/main/typescript/elvarg/game/entity/impl/object/GameObject";
import { Player } from "../src/main/typescript/elvarg/game/entity/impl/player/Player";
import { Location } from "../src/main/typescript/elvarg/game/model/Location";
import { TaskManager } from "../src/main/typescript/elvarg/game/task/TaskManager";
import { PathFinder } from "../src/main/typescript/elvarg/game/model/movement/path/PathFinder";
import { RsmodRouteFinding } from "../src/main/typescript/elvarg/game/model/movement/path/RsmodRouteFinding";

void FightType;
void WeaponProfiles;
void WeaponInterfaces;

const originalGetClipping = RegionManager.getClipping;
const blocked = new Set(["2,-1", "2,0", "2,1"]);
(RegionManager as any).getClipping = (x: number, y: number) => blocked.has(`${x},${y}`) ? 0x100 : 0;

try {
  const assertRouteSteps = (
    route: ReturnType<RsmodRouteFinding["findRoute"]>,
    start: { x: number; y: number },
  ) => {
    let previous = start;
    for (const waypoint of route.waypoints) {
      let deltaX = waypoint.x - previous.x;
      let deltaY = waypoint.y - previous.y;
      const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      for (let i = 0; i < steps; i++) {
        const next = {
          x: previous.x + Math.sign(deltaX),
          y: previous.y + Math.sign(deltaY),
        };
        assert(!blocked.has(`${next.x},${next.y}`));
        assert(RegionManager.canMove(previous.x, previous.y, next.x, next.y, 0, 1, 1, null));
        previous = next;
        deltaX = waypoint.x - previous.x;
        deltaY = waypoint.y - previous.y;
      }
    }
    return previous;
  };

  const route = new RsmodRouteFinding().findRoute({
    level: 0,
    srcX: 0,
    srcY: 0,
    srcSize: 1,
    destX: 4,
    destY: 0,
    locShape: -1,
    moveNear: false,
    privateArea: null,
  });
  assert.strictEqual(route.success, true);

  const previous = assertRouteSteps(route, { x: 0, y: 0 });
  assert(route.waypoints.length < 6, "route should contain turn checkpoints, not every tile");
  assert.strictEqual(previous.x, 4);
  assert.strictEqual(previous.y, 0);

  const longStraightRoute = new RsmodRouteFinding().findRoute({
    level: 0,
    srcX: 0,
    srcY: 10,
    srcSize: 1,
    destX: 60,
    destY: 10,
    locShape: -1,
    moveNear: false,
    privateArea: null,
  });
  assert.strictEqual(longStraightRoute.success, true);
  assert.strictEqual(longStraightRoute.waypoints.length, 1);
  assert.deepStrictEqual(assertRouteSteps(longStraightRoute, { x: 0, y: 10 }), { x: 60, y: 10 });

  blocked.add("4,0");
  const blockedFloorItem = new RsmodRouteFinding().findRoute({
    level: 0,
    srcX: 0,
    srcY: 0,
    srcSize: 1,
    destX: 4,
    destY: 0,
    locShape: -1,
    moveNear: false,
    privateArea: null,
  });
  assert.strictEqual(blockedFloorItem.success, false);
} finally {
  (RegionManager as any).getClipping = originalGetClipping;
}

async function verifyCacheCollision(): Promise<void> {
  await CachePipeline.initialize();
  RegionManager.init();
  RegionManager.loadMapFiles(3089, 3490);

  assert.strictEqual(RegionManager.getClipping(3081, 3480, 0, null) & 0x10, 0);
  assert.notStrictEqual(RegionManager.getClipping(3081, 3481, 0, null) & 0x10, 0);
  assert.notStrictEqual(RegionManager.getClipping(3093, 3508, 0, null) & 0x100, 0);
  assert.notStrictEqual(RegionManager.getClipping(3072, 3515, 0, null) & 0x80, 0);
  assert.strictEqual(RegionManager.canMove(3092, 3508, 3093, 3508, 0, 1, 1, null), false);
}

function verifyObjectInteractionRequiresStationaryReach(): void {
  const originalClipping = RegionManager.getClipping;
  (RegionManager as any).getClipping = (x: number, y: number) => x === 3 && y === 0 ? 0x100 : 0;
  try {
    const player = new Player({ write() {}, sendClientPacket() {} } as any, new Location(0, 0, 0));
    const gangplank = new GameObject(14315, new Location(3, 0, 0), 10, 0, null);
    let interactions = 0;
    player.setIndex(1);
    player.setRunning(true);
    player.getMovementQueue().walkToObject(gangplank, { execute: () => interactions++ });

    TaskManager.process();
    player.getMovementQueue().beginCycle();
    player.getMovementQueue().process();
    TaskManager.processWalkTo(player.getIndex());
    assert.equal(player.getLocation().getX(), 2);
    assert.equal(interactions, 0, "running into range must not count as stationary object reach");
    player.getMovementQueue().reset();
    assert.equal(player.getMovementQueue().didMoveThisCycle(), true,
      "clearing a route must preserve this tick's movement history");
    player.getMovementQueue().walkToObject(gangplank, { execute: () => interactions++ });
    assert.equal(interactions, 0, "reclicking after movement must still wait for a stationary tick");

    TaskManager.process();
    player.getMovementQueue().beginCycle();
    player.getMovementQueue().process();
    TaskManager.processWalkTo(player.getIndex());
    assert.equal(interactions, 1);

    const adjacent = new Player({ write() {}, sendClientPacket() {} } as any, new Location(2, 0, 0));
    adjacent.setIndex(2);
    let adjacentInteractions = 0;
    adjacent.getMovementQueue().walkToObject(gangplank, { execute: () => adjacentInteractions++ });
    assert.equal(adjacentInteractions, 1, "an adjacent stationary click must resolve without a delay");
  } finally {
    (RegionManager as any).getClipping = originalClipping;
  }
}

function verifyNpcInteractionReachAcrossBooth(): void {
  const originalClipping = RegionManager.getClipping;
  const originalPathfinder = (PathFinder as any).rsmodRouteFinding;
  (PathFinder as any).rsmodRouteFinding = new RsmodRouteFinding((x, y, z, area) =>
    RegionManager.getClipping(x, y, z, area));
  let enclosed = false;
  let opaque = false;
  (RegionManager as any).getClipping = (x: number, y: number) =>
    enclosed && x >= 1 && x <= 3 && y >= -1 && y <= 1
      ? 0x100 | (opaque ? 0x20000 : 0) : 0;
  try {
    const npc: any = {
      isNpc: () => true,
      isRegistered: () => true,
      getHitpoints: () => 1,
      getLocation: () => new Location(2, 0, 0),
      getSize: () => 1,
      getPrivateArea: () => null,
    };
    const player = new Player({ write() {}, sendClientPacket() {} } as any, new Location(0, 0, 0));
    player.setIndex(3);
    let interactions = 0;
    player.getMovementQueue().walkToEntity(npc, () => interactions++);
    assert.equal(interactions, 0, "ordinary NPCs must not activate two tiles away");
    TaskManager.process();
    player.getMovementQueue().beginCycle();
    player.getMovementQueue().process();
    TaskManager.processWalkTo(player.getIndex());
    assert.equal(player.getLocation().getX(), 1);
    assert.equal(interactions, 1, "ordinary NPC interaction activates after walking adjacent");

    enclosed = true;
    const customer = new Player({ write() {}, sendClientPacket() {} } as any, new Location(0, 0, 0));
    customer.setIndex(4);
    assert.equal(PathFinder.reachedEntity(customer, npc), false);
    let bankInteractions = 0;
    customer.getMovementQueue().walkToEntity(npc, () => bankInteractions++);
    assert.equal(bankInteractions, 1, "a visible banker with no adjacent route remains operable");

    opaque = true;
    customer.getMovementQueue().walkToEntity(npc, () => bankInteractions++);
    TaskManager.process();
    TaskManager.processWalkTo(customer.getIndex());
    assert.equal(bankInteractions, 1, "the distance fallback must not interact through a solid wall");
  } finally {
    (RegionManager as any).getClipping = originalClipping;
    (PathFinder as any).rsmodRouteFinding = originalPathfinder;
  }
}

verifyCacheCollision()
  .then(() => {
    verifyObjectInteractionRequiresStationaryReach();
    verifyNpcInteractionReachAcrossBooth();
    verifyRotatedObjectApproach();
    verifyObjectInteractionUsesArrivalTile();
  })
  .then(() => console.log("pathfinding smoke test passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

function verifyRotatedObjectApproach(): void {
  const clipping = RegionManager.getClipping;
  const definition = ObjectDefinition.forId;
  const pathfinder = (PathFinder as any).rsmodRouteFinding;
  (PathFinder as any).rsmodRouteFinding = new RsmodRouteFinding((x, y, z, area) =>
    RegionManager.getClipping(x, y, z, area));
  try {
    (ObjectDefinition as any).forId = () => ({
      getSizeX: () => 1, getSizeY: () => 3, getBlockingMask: () => 14,
    });
    for (let face = 0; face < 4; face++) {
      const width = face % 2 ? 3 : 1;
      const length = face % 2 ? 1 : 3;
      (RegionManager as any).getClipping = (x: number, y: number) =>
        x >= 0 && x < width && y >= 0 && y < length ? 0x100 : 0;
      const player = new Player({ write() {}, sendClientPacket() {} } as any, new Location(-3, -3, 0));
      player.setIndex(10 + face);
      player.setRunning(true);
      let interactions = 0;
      const expected = [[0, 3], [3, 0], [0, -1], [-1, 0]][face];
      player.getMovementQueue().walkToObject(new GameObject(1, new Location(0, 0, 0), 10, face, null), {
        execute: () => {
          assert.deepEqual([player.getLocation().getX(), player.getLocation().getY()], expected);
          assert.equal(player.getMovementQueue().didMoveThisCycle(), false);
          interactions++;
        },
      });
      for (let tick = 0; tick < 20 && !interactions; tick++) {
        TaskManager.process();
        player.getMovementQueue().beginCycle();
        player.getMovementQueue().process();
        TaskManager.processWalkTo(player.getIndex());
      }
      assert.equal(interactions, 1, `rotation ${face} must use its permitted entrance`);
    }
  } finally {
    (RegionManager as any).getClipping = clipping;
    (ObjectDefinition as any).forId = definition;
    (PathFinder as any).rsmodRouteFinding = pathfinder;
  }
}

function verifyObjectInteractionUsesArrivalTile(): void {
  const getObject = MapObjects.getPrivateArea;
  const forPlayer = ObjectDefinition.forPlayer;
  const emitRoute = PluginManager.emitObjectRoute;
  const emitInteraction = PluginManager.emitObjectInteraction;
  try {
    const player = new Player({ write() {}, sendClientPacket() {} } as any, new Location(10, 10, 0));
    let arrive: any;
    const queue = player.getMovementQueue();
    (queue as any).walkToObject = (_: any, action: any) => { arrive = action.execute; };
    (MapObjects as any).getPrivateArea = () => new GameObject(1, new Location(10, 12, 0), 10, 0, null);
    (ObjectDefinition as any).forPlayer = () => ({ getInteractions: () => ["Cross"] });
    (PluginManager as any).emitObjectRoute = (event: any) =>
      assert.deepEqual(event.sourceLocation, { x: 10, y: 10, z: 0 });
    let received = false;
    (PluginManager as any).emitObjectInteraction = (event: any) => {
      assert.deepEqual(event.sourceLocation, { x: 10, y: 14, z: 0 });
      received = true;
      return true;
    };
    new ObjectActionPacketListener().executeAction(player, 1, 10, 12, 1);
    assert(arrive);
    player.setLocation(new Location(10, 14, 0));
    arrive();
    assert(received);
  } finally {
    MapObjects.getPrivateArea = getObject;
    ObjectDefinition.forPlayer = forPlayer;
    PluginManager.emitObjectRoute = emitRoute;
    PluginManager.emitObjectInteraction = emitInteraction;
  }
}

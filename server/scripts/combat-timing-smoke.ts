import * as assert from "node:assert/strict";
import { FightType } from "../src/main/typescript/elvarg/game/content/combat/FightType";
import { WeaponProfiles } from "../src/main/typescript/elvarg/game/content/combat/WeaponProfile";
import { WeaponInterfaces } from "../src/main/typescript/elvarg/game/content/combat/WeaponInterfaces";
import { World } from "../src/main/typescript/elvarg/game/World";
import { Combat } from "../src/main/typescript/elvarg/game/content/combat/Combat";
import {
    CanAttackResponse,
    CombatFactory,
} from "../src/main/typescript/elvarg/game/content/combat/CombatFactory";
import { CombatRange } from "../src/main/typescript/elvarg/game/content/combat/CombatRange";
import { CombatType } from "../src/main/typescript/elvarg/game/content/combat/CombatType";
import { CoordinateState } from "../src/main/typescript/elvarg/game/entity/impl/npc/NPCMovementCoordinator";
import { TaskManager } from "../src/main/typescript/elvarg/game/task/TaskManager";
import { NPCDeathTask } from "../src/main/typescript/elvarg/game/task/impl/NPCDeathTask";
import { Wilderness } from "../src/main/typescript/elvarg/game/content/wilderness/Wilderness";
import { EquipPacketListener } from "../src/main/typescript/elvarg/net/packet/impl/EquipPacketListener";
import { Item } from "../src/main/typescript/elvarg/game/model/Item";
import { ItemDefinition } from "../src/main/typescript/elvarg/game/definition/ItemDefinition";
import { Inventory } from "../src/main/typescript/elvarg/game/model/container/impl/Inventory";
import { Equipment } from "../src/main/typescript/elvarg/game/model/container/impl/Equipment";
import { CacheDefinitions } from "../src/main/typescript/elvarg/game/cache/CacheDefinitions";

const { BotBehaviorTask } = require("../plugins/bots/behaviours/task/BotBehaviorTask");

void FightType;
void WeaponProfiles;
void WeaponInterfaces;

const originalCycle = World.getProcessCycle();
const originalRewardExp = CombatFactory.rewardExp;
const originalValidTarget = CombatFactory.validTarget;
const originalCanAttack = CombatFactory.canAttack;
const originalCanAttackPermission = CombatFactory.canAttackPermission;
const originalGetMethod = CombatFactory.getMethod;
const originalAddPendingHit = CombatFactory.addPendingHit;
const originalHandleRetaliation = (CombatFactory as any).handleRetaliation;
const originalCanReach = CombatRange.canReach;
const originalRoute = CombatRange.route;
const originalSubmit = TaskManager.submit;
const originalCancelTasks = TaskManager.cancelTasks;
const originalHasActiveTask = TaskManager.hasActiveTask;
const originalWasTaskActiveThisCycle = TaskManager.wasTaskActiveThisCycle;
const originalWildernessIsIn = Wilderness.isIn;
const originalResetWeapon = EquipPacketListener.resetWeapon;
const equipTestItemId = 999_999;
const originalEquipTestDefinition = ItemDefinition.definitions.get(equipTestItemId);
// ItemDefinition.forId consults the cache counts before the explicit definition
// map, so this pure smoke needs the counts stubbed or it boots the cache pipeline.
const originalGetCounts = CacheDefinitions.getCounts;

try {
    (World as any).processCycle = 50;
    (CombatFactory as any).rewardExp = () => undefined;

    const revealCycles: number[] = [];
    const target: any = {
        getHitpoints: () => 10,
        isUntargetable: () => false,
        isNeedsPlacement: () => false,
        isPlayer: () => false,
        getCombat: () => ({
            getHitQueue: () => ({
                addPendingHit: (_hit: unknown, revealCycle: number) => revealCycles.push(revealCycle),
            }),
        }),
    };
    const player: any = {
        isPlayer: () => true,
        getAsPlayer: () => ({ getArea: () => null }),
    };
    const npc: any = { isPlayer: () => false };
    const hit = (attacker: any, type: CombatType, delay: number): any => ({
        getAttacker: () => attacker,
        getTarget: () => target,
        getCombatType: () => type,
        getDelay: () => delay,
    });

    CombatFactory.addPendingHit(hit(player, CombatType.MELEE, 0));
    CombatFactory.addPendingHit(hit(player, CombatType.MELEE, 1));
    CombatFactory.addPendingHit(hit(npc, CombatType.MELEE, 0));
    CombatFactory.addPendingHit(hit(player, CombatType.RANGED, 2));
    assert.deepEqual(revealCycles, [51, 52, 50, 52]);

    let attackAttempts = 0;
    let routeCalls = 0;
    const routeTargets: Array<[number, number]> = [];
    let reach = true;
    let permission = CanAttackResponse.CAN_ATTACK;
    let queuedCheckpoints = 0;
    let routeEvaluated = false;
    let routeInvalidated = false;
    let movedThisCycle = false;
    let positionToFace: any = undefined;
    let renewAllowed = true;
    let valid = true;
    const cancelledTaskKeys: any[] = [];
    const messages: string[] = [];
    const configs: Array<[number, number]> = [];
    const order: string[] = [];
    let targetX = 3200;
    let targetSize = 1;
    const location = { getX: () => targetX, getY: () => 3200, getZ: () => 0 };
    const targetCombat = { getAttacker: () => null };
    const combatTarget: any = {
        getLocation: () => location,
        getCombat: () => targetCombat,
        getBlockAnim: () => 425,
        getIndex: () => 7,
        performAnimation: () => undefined,
        getSize: () => targetSize,
        isPlayer: () => true,
        isNpc: () => false,
    };
    const combatMovement: any = {
        reset: () => {
            queuedCheckpoints = 0;
            routeEvaluated = false;
            routeInvalidated = false;
            return combatMovement;
        },
        size: () => queuedCheckpoints,
        hasPendingWork: () => queuedCheckpoints > 0,
        getMobility: () => ({ canMove: () => true }),
        didMoveThisCycle: () => movedThisCycle,
        wasRouteEvaluated: () => routeEvaluated,
        wasRouteInvalidated: () => routeInvalidated,
    };
    const character: any = {
        isNpc: () => false,
        isPlayer: () => true,
        getIndex: () => 1,
        getAsPlayer: () => ({
            isPlayerBot: () => false,
            getPacketSender: () => ({
                sendMessage: (message: string) => messages.push(message),
                sendConfig: (id: number, value: number) => configs.push([id, value]),
            }),
        }),
        setFollowing: () => undefined,
        setMobileInteraction: () => character,
        setPositionToFace: (target: any) => positionToFace = target,
        getMovementQueue: () => combatMovement,
        isSpecialActivated: () => false,
    };
    let combat: Combat;
    let replacementTarget: any = null;
    const method: any = {
        type: () => CombatType.MELEE,
        attackSpeed: () => 4,
        attackDistance: () => 1,
        shouldRenew: () => renewAllowed,
        onCombatBegan: () => undefined,
        onCombatEnded: () => undefined,
        start: () => attackAttempts++,
        hits: () => [],
        finished: () => {
            if (replacementTarget) combat.attack(replacementTarget);
        },
    };
    combat = new Combat(character);
    combat.resolveMethodForCurrentCycle = () => method;
    (CombatFactory as any).validTarget = () => valid;
    (CombatFactory as any).canAttackPermission = () => permission;
    (CombatFactory as any).canAttack = () => permission;
    (CombatFactory as any).getMethod = () => ({ onCombatBegan: () => undefined });
    (CombatFactory as any).addPendingHit = () => undefined;
    (CombatRange as any).canReach = () => {
        order.push(reach ? "reach" : "unreachable");
        return reach;
    };
    (CombatRange as any).route = () => {
        routeCalls++;
        routeTargets.push([combatTarget.getLocation().getX(), combatTarget.getSize()]);
        routeEvaluated = true;
        queuedCheckpoints = 1;
        return true;
    };
    (TaskManager as any).cancelTasks = (key: any) => cancelledTaskKeys.push(key);

    positionToFace = { old: true };
    combat.attack(combatTarget);
    assert.deepEqual(configs.at(-1), [1075, 7], "the client must prioritize its player combat target");
    assert.equal(attackAttempts, 0, "attack() must only establish intent");
    assert.deepEqual(cancelledTaskKeys, [1], "attack intent must cancel the player's stale movement action");
    assert.equal(positionToFace, null, "attack intent must clear stale fixed facing");

    reach = false;
    (World as any).processCycle = 51;
    combat.preMovementProcess();
    assert.equal(routeCalls, 1);
    order.push("movement");
    movedThisCycle = true;
    queuedCheckpoints = 0;
    reach = true;
    combat.postMovementProcess();
    assert.equal(attackAttempts, 1);
    assert.deepEqual(order.slice(-3), ["unreachable", "movement", "reach"]);

    (World as any).processCycle = 52;
    combat.preMovementProcess();
    combat.postMovementProcess();
    combat.preMovementProcess();
    combat.postMovementProcess();
    assert.equal(attackAttempts, 1, "cooldown and phase guards must prevent a second attack");
    assert.equal(combat.getTarget(), combatTarget, "cooldown renews the interaction");

    reach = false;
    movedThisCycle = false;
    queuedCheckpoints = 0;
    routeEvaluated = false;
    (World as any).processCycle = 53;
    combat.preMovementProcess();
    assert.equal(routeCalls, 2, "pursuit must continue during weapon cooldown");
    assert.equal(attackAttempts, 1);

    queuedCheckpoints = 3;
    targetX = 3201;
    (World as any).processCycle = 54;
    combat.preMovementProcess();
    assert.equal(routeCalls, 2, "a usable checkpoint corridor must not be replaced");
    combat.postMovementProcess();

    // A corridor the clipping map no longer allows must be rebuilt, or the attacker
    // retries the same rejected step every cycle and never reaches or gives up.
    queuedCheckpoints = 3;
    routeInvalidated = true;
    (World as any).processCycle = 541;
    combat.preMovementProcess();
    assert.equal(routeCalls, 3, "a corridor blocked by clipping must be rebuilt");

    // Entity occupancy is invisible to the pathfinder, so a reroute would return the
    // same corridor. Keep the queue and resume when the blocker steps aside.
    routeInvalidated = false;
    queuedCheckpoints = 3;
    (World as any).processCycle = 542;
    combat.preMovementProcess();
    assert.equal(routeCalls, 3, "a corridor blocked by an entity must not be rebuilt");
    routeCalls = 2;

    queuedCheckpoints = 1;
    targetX = 3202;
    targetSize = 2;
    (World as any).processCycle = 55;
    combat.preMovementProcess();
    assert.equal(routeCalls, 3, "pursuit must refresh at the final checkpoint");
    assert.deepEqual(routeTargets.at(-1), [3202, 2], "final-stretch routing must use the latest target footprint");

    // Final checkpoint, target has not moved since that route was built: nothing to
    // recalculate. Rebuilding the identical corridor every cycle is pure waste.
    queuedCheckpoints = 1;
    (World as any).processCycle = 56;
    combat.preMovementProcess();
    assert.equal(routeCalls, 3, "a stationary target must not force a reroute on the final checkpoint");

    // ...and it resumes the moment the target does move.
    queuedCheckpoints = 1;
    targetX = 3203;
    (World as any).processCycle = 57;
    combat.preMovementProcess();
    assert.equal(routeCalls, 4, "a moved target must reroute on the final checkpoint");

    // An empty queue has no corridor to preserve, so it routes regardless.
    queuedCheckpoints = 0;
    (World as any).processCycle = 58;
    combat.preMovementProcess();
    assert.equal(routeCalls, 5, "an empty queue must route even for a stationary target");
    routeCalls = 3;
    targetX = 3202;

    permission = CanAttackResponse.CANT_ATTACK_IN_AREA;
    const deniedTarget = { ...combatTarget };
    combat.attack(deniedTarget);
    queuedCheckpoints = 0;
    routeEvaluated = false;
    (World as any).processCycle = 56;
    combat.preMovementProcess();
    assert.equal(combat.getTarget(), null);
    assert.equal(routeCalls, 3, "denied targets must not be routed toward");

    permission = CanAttackResponse.CAN_ATTACK;
    combat.attack(combatTarget);
    valid = false;
    assert.equal(combat.performNewAttack(true), false);
    assert.equal(combat.getTarget(), null, "an invalid instant attack must cancel its interaction coherently");
    valid = true;

    reach = true;
    replacementTarget = { ...combatTarget };
    combat.attack(combatTarget);
    (World as any).processCycle = 60;
    combat.preMovementProcess();
    combat.postMovementProcess();
    assert.equal(combat.getTarget(), replacementTarget, "old callback cleanup must preserve a replacement target");
    assert.equal(attackAttempts, 2);
    replacementTarget = null;

    reach = false;
    combat.attack(combatTarget);
    queuedCheckpoints = 0;
    routeEvaluated = false;
    (CombatRange as any).route = () => {
        routeCalls++;
        routeEvaluated = true;
        queuedCheckpoints = 0;
        return false;
    };
    (World as any).processCycle = 61;
    combat.preMovementProcess();
    combat.postMovementProcess();
    assert.equal(combat.getTarget(), null);
    assert.deepEqual(messages, ["I can't reach that!"]);
    combat.postMovementProcess();
    assert.deepEqual(messages, ["I can't reach that!"], "unreachable failure must be emitted once");

    const incomingAttacker = { id: "incoming" } as any;
    combat.setUnderAttack(incomingAttacker);
    combat.reset();
    assert.deepEqual(configs.at(-1), [1075, -1], "combat reset must clear the client combat target");
    assert.equal(combat.getAttacker(), incomingAttacker, "outgoing cancellation must preserve incoming attribution");
    combat.setUnderAttack(null);

    reach = true;
    renewAllowed = false;
    (World as any).processCycle = 70;
    combat.setAttackDelay(0);
    combat.attack(combatTarget);
    combat.preMovementProcess();
    combat.postMovementProcess();
    assert.equal(combat.getTarget(), null, "an exhausted ranged-style continuation must not renew as melee");
    renewAllowed = true;

    // A single-combat denial while a previous fight's delayed hit is still landing is
    // transient: it must not throw the click away, and it must not spam the notice.
    permission = CanAttackResponse.ALREADY_UNDER_ATTACK;
    const transientTarget = { ...combatTarget };
    combat.attack(transientTarget);
    messages.length = 0;
    attackAttempts = 0;
    queuedCheckpoints = 0;
    reach = false;
    routeCalls = 0;
    (World as any).processCycle = 600;
    combat.preMovementProcess();
    assert.equal(combat.getTarget(), transientTarget, "a transient denial must keep the target");
    assert.equal(routeCalls, 1, "a transient denial must still pursue");
    combat.postMovementProcess();
    (World as any).processCycle = 601;
    queuedCheckpoints = 0;
    combat.preMovementProcess();
    combat.postMovementProcess();
    assert.equal(combat.getTarget(), transientTarget, "still pursuing on the next cycle");
    assert.equal(messages.filter((m) => m === "You are already under attack!").length, 1,
      "the notice must be sent once per interaction, not twice a cycle");
    assert.equal(attackAttempts, 0, "a denied attacker must not land a hit");

    // ...and it resumes the moment the condition clears.
    permission = CanAttackResponse.CAN_ATTACK;
    reach = true;
    (World as any).processCycle = 602;
    combat.preMovementProcess();
    combat.postMovementProcess();
    assert.equal(attackAttempts, 1, "the attack resumes once the denial clears");


    reach = false;
    let npcCheckpoint = 0;
    let npcBlockedByOccupancy = false;
    const npcMovement: any = {
        reset: () => { npcCheckpoint = 0; return npcMovement; },
        size: () => npcCheckpoint,
        getMobility: () => ({ canMove: () => true }),
        setPursuitCheckpoint: () => { npcCheckpoint = 1; },
        didMoveThisCycle: () => false,
        wasBlockedByDynamicOccupancy: () => npcBlockedByOccupancy,
        wasRouteEvaluated: () => true,
        hasPendingWork: () => npcCheckpoint > 0,
    };
    const npcCharacter: any = {
        isNpc: () => true,
        isPlayer: () => false,
        getAsNpc: () => npcCharacter,
        getDefinition: () => ({ doesFightBack: () => true }),
        getCurrentDefinition: () => ({ doesRetreat: () => false }),
        getMovementCoordinator: () => ({ getCoordinateState: () => CoordinateState.HOME }),
        getLocation: () => ({ getX: () => 0, getY: () => 0, getZ: () => 0, getDistance: () => 5, transform: () => ({}) }),
        getSize: () => 1,
        getPrivateArea: () => null,
        getAttribute: () => null,
        getMovementQueue: () => npcMovement,
        setFollowing: () => undefined,
        setMobileInteraction: () => npcCharacter,
        setPositionToFace: () => undefined,
    };
    const npcCombat = new Combat(npcCharacter);
    npcCombat.resolveMethodForCurrentCycle = () => method;
    npcCombat.attack(combatTarget);
    (World as any).processCycle = 71;
    npcCombat.preMovementProcess();
    npcCombat.postMovementProcess();
    assert.equal(npcCombat.getTarget(), null, "a blocked NPC pursuit must return to normal mode");

    npcBlockedByOccupancy = true;
    npcCombat.attack(combatTarget);
    (World as any).processCycle = 72;
    npcCombat.preMovementProcess();
    npcCombat.postMovementProcess();
    assert.equal(npcCombat.getTarget(), combatTarget, "a transiently occupied NPC step must remain pending");
    npcCombat.reset();

    combat.reset();
    assert.equal(positionToFace, null);

    const equipTarget = { id: "equip-target" } as any;
    let targetAfterEquip: any = equipTarget;
    let equipResetCalls = 0;
    const equipAttackDelay = 3;
    const equipCombat: any = {
        getTarget: () => targetAfterEquip,
        getAttackDelay: () => equipAttackDelay,
        reset: () => {
            equipResetCalls++;
            targetAfterEquip = null;
        },
    };
    let equipInventory: Inventory;
    let equipEquipment: Equipment;
    const equipPacketSender: any = {
        sendInterfaceRemoval: () => equipPacketSender,
        sendItemContainer: () => equipPacketSender,
        sendMessage: () => equipPacketSender,
        sendSoundEffect: () => equipPacketSender,
        sendSpecialAttackState: () => equipPacketSender,
        sendString: () => equipPacketSender,
    };
    const equipPlayer: any = {
        getUsername: () => "Equip test",
        getHitpoints: () => 10,
        getInventory: () => equipInventory,
        getEquipment: () => equipEquipment,
        getInterfaceId: () => 0,
        getPacketSender: () => equipPacketSender,
        getSkillManager: () => ({ stopSkillable: () => undefined }),
        getCombat: () => equipCombat,
        getBonusManager: () => ({
            attackBonus: new Array(5).fill(0),
            defenceBonus: new Array(5).fill(0),
            otherBonus: new Array(4).fill(0),
        }),
        getUpdateFlag: () => ({ flag: () => undefined }),
        isPlayer: () => true,
        getAsPlayer: () => equipPlayer,
        isPlayerBot: () => true,
    };
    equipInventory = new Inventory(equipPlayer);
    equipEquipment = new Equipment(equipPlayer);
    ItemDefinition.definitions.set(equipTestItemId, {
        getBonuses: () => null,
        getEquipmentType: () => ({ getSlot: () => Equipment.WEAPON_SLOT }),
        getRequirements: () => null,
        isDoubleHanded: () => false,
        isStackable: () => false,
    } as any);
    equipInventory.setItem(0, new Item(equipTestItemId));
    (EquipPacketListener as any).resetWeapon = () => undefined;
    (CacheDefinitions as any).getCounts = () => ({ npcs: 0, items: 0, objects: 0 });
    EquipPacketListener.equip(equipPlayer, equipTestItemId, 0, Inventory.INTERFACE_ID);
    assert.equal(equipEquipment.get(Equipment.WEAPON_SLOT).getId(), equipTestItemId);
    assert.equal(equipCombat.getTarget(), equipTarget, "equipping must preserve the active combat target");
    assert.equal(equipCombat.getAttackDelay(), equipAttackDelay, "equipping must preserve attack cooldown");
    assert.equal(equipResetCalls, 0, "equipping must not reset combat");

    (CombatFactory as any).handleRetaliation = () => undefined;
    const impactBlocks = (type: CombatType, hitpoints: number, damage: number): number => {
        let blocks = 0;
        const queue = { getQueuedDamage: () => 0, addPendingDamage: () => undefined };
        const combatState = {
            getHitQueue: () => queue,
            setUnderAttack: () => undefined,
            addDamage: () => undefined,
        };
        const attacker: any = {
            getHitpoints: () => 10,
            isPlayer: () => false,
            isNpc: () => true,
            getAsNpc: () => ({
                getCurrentDefinition: () => ({ isPoisonous: () => false, isVenomous: () => false }),
            }),
        };
        const resolvedHit: any = {
            getAttacker: () => attacker,
            getTarget: () => victim,
            getCombatMethod: () => null,
            getCombatType: () => type,
            getTotalDamage: () => damage,
            getHandleAfterHitEffects: () => false,
            getHits: () => [],
        };
        const victim: any = {
            getHitpoints: () => hitpoints,
            isUntargetable: () => false,
            isNeedsPlacement: () => false,
            manipulateHit: () => resolvedHit,
            getCombat: () => combatState,
            getBlockAnim: () => 425,
            performAnimation: () => blocks++,
            isPlayer: () => false,
            hasVengeanceReturn: () => false,
            isPlayerBot: () => false,
        };
        CombatFactory.executeHit(resolvedHit);
        return blocks;
    };
    assert.equal(impactBlocks(CombatType.RANGED, 10, 9), 1);
    assert.equal(impactBlocks(CombatType.RANGED, 10, 10), 0);
    assert.equal(impactBlocks(CombatType.MELEE, 10, 1), 0);

    (CombatFactory as any).handleRetaliation = originalHandleRetaliation;
    let retaliationDelay = -1;
    let retaliationDisabled = false;
    const attacker: any = { getHitpoints: () => 10, isRegistered: () => true, isPlayer: () => false };
    const retaliationCombat = {
        getTarget: () => null,
        extendAttackDelay: (ticks: number) => retaliationDelay = ticks,
        attack: () => undefined,
    };
    const retaliatingNpc: any = {
        getCombat: () => retaliationCombat,
        isPlayer: () => false,
        isNpc: () => true,
        getAsNpc: () => ({
            getMovementCoordinator: () => ({ getCoordinateState: () => CoordinateState.HOME }),
        }),
        hasFlag: () => retaliationDisabled,
        getMovementQueue: () => ({ reset: () => undefined }),
    };
    (CombatFactory as any).getMethod = () => ({ attackSpeed: () => 4 });
    (TaskManager as any).submit = () => undefined;
    (CombatFactory as any).handleRetaliation(attacker, retaliatingNpc);
    assert.equal(retaliationDelay, 2);
    retaliationDelay = -1;
    retaliationDisabled = true;
    (CombatFactory as any).handleRetaliation(attacker, retaliatingNpc);
    assert.equal(retaliationDelay, -1);

    let busy = true;
    let retaliationTask: any = null;
    let playerAttacks = 0;
    const playerQueue = { size: () => 0, isMovings: () => false };
    const retaliatingPlayer: any = {
        getIndex: () => 7,
        getCombat: () => ({
            getTarget: () => null,
            extendAttackDelay: () => undefined,
            attack: () => playerAttacks++,
        }),
        getMovementQueue: () => playerQueue,
        isPlayer: () => true,
        isNpc: () => false,
        getAsPlayer: () => ({ autoRetaliateReturn: () => true }),
    };
    (TaskManager as any).hasActiveTask = () => busy;
    (TaskManager as any).wasTaskActiveThisCycle = () => false;
    (TaskManager as any).submit = (task: any) => retaliationTask = task;
    (CombatFactory as any).handleRetaliation(attacker, retaliatingPlayer);
    assert.equal(retaliationTask, null, "a pending interaction must block auto-retaliation");
    busy = false;
    (CombatFactory as any).handleRetaliation(attacker, retaliatingPlayer);
    assert.ok(retaliationTask, "an idle player may auto-retaliate");
    busy = true;
    retaliationTask.execute();
    assert.equal(playerAttacks, 0, "a new interaction must cancel scheduled auto-retaliation");

    let botTarget: any = null;
    let botAttacks = 0;
    const botAttacker: any = {
        getUsername: () => "Attacker",
        getHitpoints: () => 10,
        isRegistered: () => true,
        getPrivateArea: () => null,
        isPlayerBot: () => true,
    };
    const botCombat: any = {
        getAttacker: () => botAttacker,
        getTarget: () => botTarget,
        attack: (target: any) => {
            botAttacks++;
            botTarget = target;
        },
    };
    const bot: any = {
        getCombat: () => botCombat,
        getPrivateArea: () => null,
        getCombatFollowing: () => null,
        getMovementQueue: () => ({ reset: () => undefined }),
        getUsername: () => "Defender",
    };
    const botState: any = {
        mode: "pvp",
        pvp: { targetPlayer: botAttacker, targetUsername: "Attacker" },
    };
    const botTaskContext: any = {
        isPvpOnlyBot: () => true,
        AreaManager: { inMulti: () => true },
        behaviorMode: { PVP: "pvp" },
        api: null,
    };
    (Wilderness as any).isIn = () => true;
    assert.equal(
        BotBehaviorTask.prototype.tryAdoptCombatAttacker.call(
            botTaskContext,
            { player: bot, state: botState },
            Date.now(),
        ),
        true,
    );
    assert.equal(botAttacks, 1);
    const existingTarget = { getUsername: () => "Existing target" };
    botTarget = existingTarget;
    assert.equal(
        BotBehaviorTask.prototype.tryAdoptCombatAttacker.call(
            botTaskContext,
            { player: bot, state: botState },
            Date.now(),
        ),
        false,
    );
    assert.equal(botTarget, existingTarget);
    assert.equal(botAttacks, 1);

    let deathAnimations = 0;
    let clearedAttacker = false;
    const movement = {
        setBlockMovement: () => movement,
        reset: () => movement,
    };
    const dyingNpc: any = {
        getMovementQueue: () => movement,
        getCombat: () => ({
            getKiller: () => null,
            reset: () => undefined,
            setUnderAttack: (value: unknown) => clearedAttacker = value === null,
        }),
        getCurrentDefinition: () => ({ getDeathAnim: () => 836, getDeathSound: () => -1 }),
        performAnimation: () => deathAnimations++,
        setMobileInteraction: () => undefined,
    };
    const deathTask = new NPCDeathTask(dyingNpc);
    deathTask.setRunning(true);
    assert.equal(deathTask.getRemainingTicks(), 1);
    assert.equal(deathTask.tick(), true);
    assert.equal(deathAnimations, 1);
    assert.equal(clearedAttacker, true);
    assert.equal(deathTask.getRemainingTicks(), 2);

    console.info("combat timing smoke passed");
} finally {
    (World as any).processCycle = originalCycle;
    (CombatFactory as any).rewardExp = originalRewardExp;
    (CombatFactory as any).validTarget = originalValidTarget;
    (CombatFactory as any).canAttack = originalCanAttack;
    (CombatFactory as any).canAttackPermission = originalCanAttackPermission;
    (CombatFactory as any).getMethod = originalGetMethod;
    (CombatFactory as any).addPendingHit = originalAddPendingHit;
    (CombatFactory as any).handleRetaliation = originalHandleRetaliation;
    (CombatRange as any).canReach = originalCanReach;
    (CombatRange as any).route = originalRoute;
    (TaskManager as any).submit = originalSubmit;
    (TaskManager as any).cancelTasks = originalCancelTasks;
    (TaskManager as any).hasActiveTask = originalHasActiveTask;
    (TaskManager as any).wasTaskActiveThisCycle = originalWasTaskActiveThisCycle;
    (Wilderness as any).isIn = originalWildernessIsIn;
    (EquipPacketListener as any).resetWeapon = originalResetWeapon;
    (CacheDefinitions as any).getCounts = originalGetCounts;
    if (originalEquipTestDefinition) ItemDefinition.definitions.set(equipTestItemId, originalEquipTestDefinition);
    else ItemDefinition.definitions.delete(equipTestItemId);
}

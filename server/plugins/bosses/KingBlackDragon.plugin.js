const { Location } = require("../../src/main/typescript/elvarg/game/model/Location");
const { CombatMethod } = require("../../src/main/typescript/elvarg/game/content/combat/method/CombatMethod");
const { PendingHit } = require("../../src/main/typescript/elvarg/game/content/combat/hit/PendingHit");
const { Misc } = require("../../src/main/typescript/elvarg/util/Misc");
const { CombatType } = require("../../src/main/typescript/elvarg/game/content/combat/CombatType");
const { Projectile } = require("../../src/main/typescript/elvarg/game/model/Projectile");
const { CombatEquipment } = require("../../src/main/typescript/elvarg/game/content/combat/CombatEquipment");
const { Animation } = require("../../src/main/typescript/elvarg/game/model/Animation");
const { NpcIdentifiers } = require("../../src/main/typescript/elvarg/util/NpcIdentifiers");

const KING_BLACK_DRAGON_IDS = [
  NpcIdentifiers.KING_BLACK_DRAGON,
  NpcIdentifiers.KING_BLACK_DRAGON_2,
  NpcIdentifiers.KING_BLACK_DRAGON_3,
];
const KBD_LADDER_DOWN_OBJECT_ID = 18987;

const KingBlackDragonLairLocation = new Location(2271, 4680, 0);

const Breath = {
  DRAGON: 0,
  ICE: 1,
  POISON: 2,
  SHOCK: 3,
};

class KingBlackDragonCombatMethod extends CombatMethod {
  constructor() {
    super();
    this.currentAttackType = CombatType.MAGIC;
    this.currentBreath = Breath.DRAGON;
  }

  start(character, target) {
    if (this.currentAttackType === CombatType.MAGIC) {
      character.performAnimation(new Animation(84));
      let projectileId = 393;
      switch (this.currentBreath) {
        case Breath.DRAGON:
          projectileId = 393;
          break;
        case Breath.ICE:
          projectileId = 396;
          break;
        case Breath.POISON:
          projectileId = 394;
          break;
        case Breath.SHOCK:
          projectileId = 395;
          break;
        default:
          break;
      }
      Projectile.createProjectile(character, target, projectileId, 40, 55, 31, 43).sendProjectile();
    } else if (this.currentAttackType === CombatType.MELEE) {
      character.performAnimation(new Animation(91));
    }
  }

  attackSpeed() {
    return this.currentAttackType === CombatType.MAGIC ? 6 : 4;
  }

  attackDistance() {
    return 8;
  }

  type() {
    return this.currentAttackType;
  }

  hits(character, target) {
    const hit = new PendingHit(character, target, this, 1);
    if (target.isPlayer()) {
      const player = target.getAsPlayer();
      if (this.currentAttackType === CombatType.MAGIC && this.currentBreath === Breath.DRAGON) {
        if (
          PrayerHandler.isActivated(player, PrayerHandler.PROTECT_FROM_MAGIC) &&
          CombatEquipment.hasDragonProtectionGear(player) &&
          !player.getCombat().getFireImmunityTimer().finished()
        ) {
          target.getPacketSender().sendMessage("You're protected against the dragonfire breath.");
          return [hit];
        }
        let extendedHit = 25;
        if (PrayerHandler.isActivated(player, PrayerHandler.PROTECT_FROM_MAGIC)) {
          extendedHit -= 5;
        }
        if (!player.getCombat().getFireImmunityTimer().finished()) {
          extendedHit -= 10;
        }
        if (CombatEquipment.hasDragonProtectionGear(player)) {
          extendedHit -= 10;
        }
        player.getPacketSender().sendMessage("The dragonfire burns you.");
        hit.getHits()[0].incrementDamage(extendedHit);
      }
      if (this.currentAttackType === CombatType.MAGIC) {
        switch (this.currentBreath) {
          case Breath.ICE:
            CombatFactory.freeze(player, 5);
            break;
          case Breath.POISON:
            CombatFactory.poisonEntity(player, 30);
            break;
          default:
            break;
        }
      }
    }
    return [hit];
  }

  finished(character, target) {
    if (character.getLocation().getDistance(target.getLocation()) <= 3) {
      if (Misc.randomInclusive(0, 2) === 0) {
        this.currentAttackType = CombatType.MAGIC;
      } else {
        this.currentAttackType = CombatType.MELEE;
      }
    } else {
      this.currentAttackType = CombatType.MAGIC;
    }
    if (this.currentAttackType === CombatType.MAGIC) {
      const random = Misc.randomInclusive(0, 10);
      if (random >= 0 && random <= 3) {
        this.currentBreath = Breath.DRAGON;
      } else if (random >= 4 && random <= 6) {
        this.currentBreath = Breath.SHOCK;
      } else if (random >= 7 && random <= 9) {
        this.currentBreath = Breath.POISON;
      } else {
        this.currentBreath = Breath.ICE;
      }
    }
  }
}

let PrayerHandler;
let CombatFactory;

module.exports = {
  name: "KingBlackDragon",
  register(api) {
    PrayerHandler = api.getPrayerHandler();
    CombatFactory = api.getCombatFactory();

    api.onObjectFirstClick(KBD_LADDER_DOWN_OBJECT_ID, ({ player }) => {
      player.moveTo(KingBlackDragonLairLocation);
      return true;
    });

    api.registerNpcCombatMethodProvider(KING_BLACK_DRAGON_IDS, KingBlackDragonCombatMethod);
  },
};

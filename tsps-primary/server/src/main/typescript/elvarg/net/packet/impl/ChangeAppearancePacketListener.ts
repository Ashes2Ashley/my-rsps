import { Appearance } from "../../../game/model/Appearance";

export class ChangeAppearancePacketListener {
  private static readonly ALLOWED_COLORS: number[][] = [
    [0, 11], // hair color
    [0, 15], // torso color
    [0, 15], // legs color
    [0, 5], // feet color
    [0, 7], // skin color
  ];
  private static readonly FEMALE_VALUES: number[][] = [
    [45, 54], // head
    [-1, -1], // jaw
    [56, 60], // torso
    [61, 65], // arms
    [67, 68], // hands
    [70, 77], // legs
    [79, 80], // feet
  ];
  private static readonly MALE_VALUES: number[][] = [
    [0, 8], // head
    [10, 17], // jaw
    [18, 25], // torso
    [26, 31], // arms
    [33, 34], // hands
    [36, 40], // legs
    [42, 43], // feet
  ];

  public static apply(player: any, gender: number, kits: number[], colors: number[]): void {
    if (!player?.getAppearance?.().getCanChangeAppearance() || player.getInterfaceId() <= 0) return;
    if ((gender !== 0 && gender !== 1) || kits.length !== 7 || colors.length !== 5) return;
    const kitRanges = gender === 0 ? ChangeAppearancePacketListener.MALE_VALUES : ChangeAppearancePacketListener.FEMALE_VALUES;
    const clampedKits = kits.map((value, i) => {
      if (value === 255) return -1; // 255 = no kit for this slot (e.g. no beard), always legal.
      const [min, max] = kitRanges[i];
      return value < min || value > max ? min : value;
    });
    const clampedColors = colors.map((value, i) => {
      const [min, max] = ChangeAppearancePacketListener.ALLOWED_COLORS[i];
      return value < min || value > max ? min : value;
    });
    const look = [...player.getAppearance().getLook()];
    look[Appearance.GENDER] = gender;
    [Appearance.HEAD, Appearance.BEARD, Appearance.CHEST, Appearance.ARMS,
      Appearance.HANDS, Appearance.LEGS, Appearance.FEET]
      .forEach((index, i) => look[index] = clampedKits[i]);
    [Appearance.HAIR_COLOUR, Appearance.TORSO_COLOUR, Appearance.LEG_COLOUR,
      Appearance.FEET_COLOUR, Appearance.SKIN_COLOUR]
      .forEach((index, i) => look[index] = clampedColors[i]);
    player.getAppearance().setLookArray(look);
    player.getPacketSender().sendInterfaceRemoval();
    player.getAppearance().setCanChangeAppearance(false);
  }
}

const PVP_LAYOUT_SCRIPT = 386;
const PVP_LEVEL_SCRIPT = 388;
const PVP_RANGE_UID = (90 << 16) | 49;
const PVP_LEVEL_UID = (90 << 16) | 50;
const VARBIT_IN_WILDERNESS = 5963;
const PVP_TEXT_COLOUR = 0xffff00;

type WidgetManagerLike = {
    getWidgetByUid(uid: number): any;
    invalidateWidget(widget: any, source?: string): void;
};

type VarManagerLike = {
    getVarbit(id: number): number | undefined;
};

/**
 * The enhanced-client branch of pvp_icons expects a native combat-range overlay that
 * this webclient does not provide. Keep the cache widgets in the equivalent OSRS desktop
 * layout whenever script 386 refreshes them.
 *
 * Both rows belong to the levelled Wilderness. The varbit only says the tile is PvP, so the
 * level row is the signal for the rest: the server hides it wherever no level applies - a
 * PvP zone outside the Wilderness, or a world that is PvP everywhere - and the cache paints
 * its text from the client's own coordinates regardless. Script 388 runs after 386, so
 * reconverging on both keeps the rows right whichever way the player crossed.
 */
export function applyWildernessHudLayout(
    widgetManager: WidgetManagerLike,
    varManager: VarManagerLike,
    completedScriptId: number,
): boolean {
    if (completedScriptId !== PVP_LAYOUT_SCRIPT && completedScriptId !== PVP_LEVEL_SCRIPT) {
        return false;
    }
    if (varManager.getVarbit(VARBIT_IN_WILDERNESS) !== 1) {
        return false;
    }

    const range = widgetManager.getWidgetByUid(PVP_RANGE_UID);
    const level = widgetManager.getWidgetByUid(PVP_LEVEL_UID);
    if (!range || !level) {
        return false;
    }

    // No level row means no level, and a combat range with no level behind it applies to
    // nobody, so it goes with it. Never unhide the level row: that flag is the server's.
    if (level.hidden || !level.text) {
        range.hidden = true;
        widgetManager.invalidateWidget(range, "wilderness-hud");
        return false;
    }

    range.hidden = false;
    range.rawY = 3;
    range.yPositionMode = 2;
    range.color = PVP_TEXT_COLOUR;
    range.textColor = PVP_TEXT_COLOUR;

    level.rawY = 16;
    level.yPositionMode = 2;
    level.color = PVP_TEXT_COLOUR;
    level.textColor = PVP_TEXT_COLOUR;

    widgetManager.invalidateWidget(range, "wilderness-hud");
    widgetManager.invalidateWidget(level, "wilderness-hud");
    return true;
}

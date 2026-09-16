/**
 * The cache's chatbox search (clientscript 750) only knows how to search item names.
 * The server reuses that same interface to search NPCs by opening it with this title,
 * which flips OC_FIND/OC_NAME over to the npc types for the life of that search.
 */
export const NPC_SEARCH_TITLE = "NPC Search";

let active = false;
let results = new Set<number>();

export function setNpcSearch(enabled: boolean): void {
    active = enabled;
    results = new Set();
}

export function isNpcSearch(): boolean {
    return active;
}

export function setNpcSearchResults(ids: number[]): void {
    results = new Set(ids);
}

/** True only for ids the open npc search produced, so item lookups elsewhere stay item lookups. */
export function isNpcSearchResult(id: number): boolean {
    return active && results.has(id);
}

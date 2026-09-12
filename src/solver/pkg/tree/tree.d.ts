/* tslint:disable */
/* eslint-disable */

export class TreeManager {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    actions(): string;
    add_bet_action(amount: number, is_raise: boolean): void;
    added_lines(): string;
    apply_history(line: string): void;
    back_to_root(): void;
    delete_added_line(line: string): void;
    delete_removed_line(line: string): void;
    invalid_terminals(): string;
    is_chance_node(): boolean;
    is_error(): boolean;
    is_terminal_node(): boolean;
    static new(board_len: number, starting_pot: number, effective_stack: number, donk_option: boolean, oop_flop_bet: string, oop_flop_raise: string, oop_turn_bet: string, oop_turn_raise: string, oop_turn_donk: string, oop_river_bet: string, oop_river_raise: string, oop_river_donk: string, ip_flop_bet: string, ip_flop_raise: string, ip_turn_bet: string, ip_turn_raise: string, ip_river_bet: string, ip_river_raise: string, add_allin_threshold: number, force_allin_threshold: number, merging_threshold: number, added_lines: string, removed_lines: string, max_raises: number): TreeManager;
    play(action: string): number;
    remove_current_node(): void;
    removed_lines(): string;
    total_bet_amount(): Int32Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_treemanager_free: (a: number, b: number) => void;
    readonly treemanager_actions: (a: number) => [number, number];
    readonly treemanager_add_bet_action: (a: number, b: number, c: number) => void;
    readonly treemanager_added_lines: (a: number) => [number, number];
    readonly treemanager_apply_history: (a: number, b: number, c: number) => void;
    readonly treemanager_back_to_root: (a: number) => void;
    readonly treemanager_delete_added_line: (a: number, b: number, c: number) => void;
    readonly treemanager_delete_removed_line: (a: number, b: number, c: number) => void;
    readonly treemanager_invalid_terminals: (a: number) => [number, number];
    readonly treemanager_is_chance_node: (a: number) => number;
    readonly treemanager_is_error: (a: number) => number;
    readonly treemanager_is_terminal_node: (a: number) => number;
    readonly treemanager_new: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number, v: number, w: number, x: number, y: number, z: number, a1: number, b1: number, c1: number, d1: number, e1: number, f1: number, g1: number, h1: number, i1: number, j1: number, k1: number, l1: number, m1: number, n1: number) => number;
    readonly treemanager_play: (a: number, b: number, c: number) => number;
    readonly treemanager_remove_current_node: (a: number) => void;
    readonly treemanager_removed_lines: (a: number) => [number, number];
    readonly treemanager_total_bet_amount: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

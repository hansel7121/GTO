/* @ts-self-types="./tree.d.ts" */

export class TreeManager {
    static __wrap(ptr) {
        const obj = Object.create(TreeManager.prototype);
        obj.__wbg_ptr = ptr;
        TreeManagerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TreeManagerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_treemanager_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    actions() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.treemanager_actions(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} amount
     * @param {boolean} is_raise
     */
    add_bet_action(amount, is_raise) {
        wasm.treemanager_add_bet_action(this.__wbg_ptr, amount, is_raise);
    }
    /**
     * @returns {string}
     */
    added_lines() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.treemanager_added_lines(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} line
     */
    apply_history(line) {
        const ptr0 = passStringToWasm0(line, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.treemanager_apply_history(this.__wbg_ptr, ptr0, len0);
    }
    back_to_root() {
        wasm.treemanager_back_to_root(this.__wbg_ptr);
    }
    /**
     * @param {string} line
     */
    delete_added_line(line) {
        const ptr0 = passStringToWasm0(line, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.treemanager_delete_added_line(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} line
     */
    delete_removed_line(line) {
        const ptr0 = passStringToWasm0(line, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.treemanager_delete_removed_line(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @returns {string}
     */
    invalid_terminals() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.treemanager_invalid_terminals(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {boolean}
     */
    is_chance_node() {
        const ret = wasm.treemanager_is_chance_node(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    is_error() {
        const ret = wasm.treemanager_is_error(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {boolean}
     */
    is_terminal_node() {
        const ret = wasm.treemanager_is_terminal_node(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {number} board_len
     * @param {number} starting_pot
     * @param {number} effective_stack
     * @param {boolean} donk_option
     * @param {string} oop_flop_bet
     * @param {string} oop_flop_raise
     * @param {string} oop_turn_bet
     * @param {string} oop_turn_raise
     * @param {string} oop_turn_donk
     * @param {string} oop_river_bet
     * @param {string} oop_river_raise
     * @param {string} oop_river_donk
     * @param {string} ip_flop_bet
     * @param {string} ip_flop_raise
     * @param {string} ip_turn_bet
     * @param {string} ip_turn_raise
     * @param {string} ip_river_bet
     * @param {string} ip_river_raise
     * @param {number} add_allin_threshold
     * @param {number} force_allin_threshold
     * @param {number} merging_threshold
     * @param {string} added_lines
     * @param {string} removed_lines
     * @param {number} max_raises
     * @returns {TreeManager}
     */
    static new(board_len, starting_pot, effective_stack, donk_option, oop_flop_bet, oop_flop_raise, oop_turn_bet, oop_turn_raise, oop_turn_donk, oop_river_bet, oop_river_raise, oop_river_donk, ip_flop_bet, ip_flop_raise, ip_turn_bet, ip_turn_raise, ip_river_bet, ip_river_raise, add_allin_threshold, force_allin_threshold, merging_threshold, added_lines, removed_lines, max_raises) {
        const ptr0 = passStringToWasm0(oop_flop_bet, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(oop_flop_raise, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(oop_turn_bet, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(oop_turn_raise, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(oop_turn_donk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(oop_river_bet, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passStringToWasm0(oop_river_raise, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passStringToWasm0(oop_river_donk, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passStringToWasm0(ip_flop_bet, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passStringToWasm0(ip_flop_raise, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len9 = WASM_VECTOR_LEN;
        const ptr10 = passStringToWasm0(ip_turn_bet, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len10 = WASM_VECTOR_LEN;
        const ptr11 = passStringToWasm0(ip_turn_raise, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len11 = WASM_VECTOR_LEN;
        const ptr12 = passStringToWasm0(ip_river_bet, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len12 = WASM_VECTOR_LEN;
        const ptr13 = passStringToWasm0(ip_river_raise, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len13 = WASM_VECTOR_LEN;
        const ptr14 = passStringToWasm0(added_lines, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len14 = WASM_VECTOR_LEN;
        const ptr15 = passStringToWasm0(removed_lines, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len15 = WASM_VECTOR_LEN;
        const ret = wasm.treemanager_new(board_len, starting_pot, effective_stack, donk_option, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10, ptr11, len11, ptr12, len12, ptr13, len13, add_allin_threshold, force_allin_threshold, merging_threshold, ptr14, len14, ptr15, len15, max_raises);
        return TreeManager.__wrap(ret);
    }
    /**
     * @param {string} action
     * @returns {number}
     */
    play(action) {
        const ptr0 = passStringToWasm0(action, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.treemanager_play(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    remove_current_node() {
        wasm.treemanager_remove_current_node(this.__wbg_ptr);
    }
    /**
     * @returns {string}
     */
    removed_lines() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.treemanager_removed_lines(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Int32Array}
     */
    total_bet_amount() {
        const ret = wasm.treemanager_total_bet_amount(this.__wbg_ptr);
        var v1 = getArrayI32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) TreeManager.prototype[Symbol.dispose] = TreeManager.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./tree_bg.js": import0,
    };
}

const TreeManagerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_treemanager_free(ptr, 1));

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedInt32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('tree_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };

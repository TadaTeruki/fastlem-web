/* tslint:disable */
/* eslint-disable */
/**
* @param {number} buffer_width
* @param {number} buffer_height
* @param {number} pixel_scale
* @param {any[]} nodes
* @returns {Float64Array}
*/
export function nearest_node_buffer(buffer_width: number, buffer_height: number, pixel_scale: number, nodes: any[]): Float64Array;
/**
* @param {number} image_width
* @param {number} image_height
* @param {number} node_num
* @param {number} edge_node
* @param {any[]} nodes
* @returns {TerrainObject}
*/
export function run_terrain_generator(image_width: number, image_height: number, node_num: number, edge_node: number, nodes: any[]): TerrainObject;
/**
*/
export class Node {
  free(): void;
/**
*/
  erodibility: number;
/**
*/
  is_ocean: boolean;
/**
*/
  x: number;
/**
*/
  y: number;
}
/**
*/
export class TerrainObject {
  free(): void;
/**
* @param {number} x
* @param {number} y
* @returns {number}
*/
  get_altitude(x: number, y: number): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly nearest_node_buffer: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly __wbg_terrainobject_free: (a: number) => void;
  readonly terrainobject_get_altitude: (a: number, b: number, c: number) => number;
  readonly run_terrain_generator: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly __wbg_node_free: (a: number) => void;
  readonly __wbg_get_node_x: (a: number) => number;
  readonly __wbg_set_node_x: (a: number, b: number) => void;
  readonly __wbg_get_node_y: (a: number) => number;
  readonly __wbg_set_node_y: (a: number, b: number) => void;
  readonly __wbg_get_node_erodibility: (a: number) => number;
  readonly __wbg_set_node_erodibility: (a: number, b: number) => void;
  readonly __wbg_get_node_is_ocean: (a: number) => number;
  readonly __wbg_set_node_is_ocean: (a: number, b: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;

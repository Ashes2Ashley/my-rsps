import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHdProgram } from "../game/plugins/hd/HdShader";
import { resolveHdEnvironment } from "../game/plugins/hd/HdEnvironment";
import { animateHdLight, hdLightOffset } from "../game/plugins/hd/HdLights";
import { HD_OBJECT_LIGHTS_BY_ID } from "../game/plugins/hd/hdObjectLightData";
import { prependDefines } from "../render/shaders/ShaderUtil";

function shader(file: string): string {
    return fs.readFileSync(file, "utf8").replace(/^#include "([^"]+)";?/gm,
        (_, include) => shader(path.resolve(path.dirname(file), include)));
}

const lighting = shader(path.resolve(__dirname, "../game/plugins/hd/hd-lighting.glsl"));
const programs: string[][] = [];
for (const kind of ["main", "npc", "projectile", "player"]) {
    const vertex = shader(path.resolve(__dirname, `../render/shaders/${kind}.vert.glsl`));
    const fragment = shader(path.resolve(__dirname, `../render/shaders/${kind === "player" ? "player" : "main"}.frag.glsl`));
    for (const alpha of [false, true]) for (const multiDraw of [false, true]) {
        const defines = [...(alpha ? ["DISCARD_ALPHA"] : []), ...(multiDraw ? ["MULTI_DRAW"] : [])];
        const result = createHdProgram([prependDefines(vertex, defines), prependDefines(fragment, defines)], lighting);
        assert.match(result[0], /uniform bool u_hdEnabled/);
        assert.match(result[1], /if \(u_hdEnabled &&/);
        if (kind !== "player") {
            assert.match(result[1], /if \(u_hdEnabled && !isFloorWater\)/);
            const waterFunction = fragment.slice(fragment.indexOf("vec3 shadeWater("), fragment.indexOf("vec4 sampleModelTexture("));
            assert.ok(result[1].includes(waterFunction), "Water shading must remain byte-for-byte unchanged");
        }
        programs.push(result);
    }
}
assert.throws(() => createHdProgram(["invalid", "invalid"], lighting), /unsupported/);
assert.equal(resolveHdEnvironment(0, 0).name, "default");
assert.equal(resolveHdEnvironment(2595 >> 8 << 6, (2595 & 255) << 6).name, "OVERWORLD");
const torch = HD_OBJECT_LIGHTS_BY_ID[196][0];
assert.ok(Number.isFinite(animateHdLight(torch, 5, 1234)));
assert.equal(animateHdLight({ ...torch, type: "STATIC" }, 1, 0), 1);
assert.deepEqual(hdLightOffset("CENTER", 3, 2, 4), [0, 0]);
assert.deepEqual(hdLightOffset("NORTH", 3, 2, 4), [0, 2]);
assert.ok(Math.abs(hdLightOffset("FRONT", 0, 2, 4)[1] + 2) < 1e-6);
assert.ok(Math.abs(hdLightOffset("FRONT", 1, 2, 4)[0] + 1) < 1e-6);

// Stub only asset loading; exercise the real plugin and its renderer lifecycle.
require.extensions[".glsl"] = (module, file) => { module.exports = fs.readFileSync(file, "utf8"); };
require.extensions[".png"] = (module, file) => { module.exports = file; };
(globalThis as any).self = globalThis;
const { HdPlugin } = require("../game/plugins/hd/HdPlugin");
const storage = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) };
(globalThis as any).Image = class { onload = null; onerror = null; src = ""; };
const plugin = new HdPlugin();
assert.equal(plugin.getEnabled(), false, "Fresh installs must keep HD disabled");
let notifications = 0;
const unsubscribe = plugin.subscribe(() => notifications++);
let deleted = 0;
let shadows = 0;
let actorShadows = 0;
const resource = () => ({ delete: () => deleted++, data() {}, resize() {}, depthTarget() { return this; } });
const values = new Map<string, unknown>();
const program = { bind() {}, uniform: (name: string, value: unknown) => values.set(name, value) };
const app = {
    createTexture2D: resource, createTextureArray: resource, createFramebuffer: resource,
    drawFramebuffer(value: unknown) { this.target = value; return this; }, target: undefined as unknown,
    viewport() { return this; }, disable() { return this; }, enable() { return this; }, depthMask() { return this; },
};
const renderer = {
    app, gl: { getParameter: () => [0, 0, 640, 480], isEnabled: () => false, clear() {}, drawBuffers() {} },
    playerPosUni: [0, 0], getFrameRenderDistanceTiles: () => 50, getPlayerRawPlane: () => 0,
    osrsClient: { camera: { viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } },
    mapManager: { visibleMapCount: 0 }, textureIdIndexMap: new Map(),
    sampleHeightAtExactPlane: () => 0, shouldUseDirectTextureScenePass: () => true,
    framebuffer: {}, textureFramebuffer: {},
    renderOpaquePass: () => shadows++, renderTransparentPass() {},
};
plugin.sceneProgramsReady(renderer, [program]);
plugin.beforeSceneRender(renderer, () => actorShadows++);
assert.equal(shadows, 0);
plugin.setEnabled(true);
plugin.beforeSceneRender(renderer, () => actorShadows++);
assert.equal(shadows, 1);
assert.equal(actorShadows, 1);
assert.equal(app.target, renderer.textureFramebuffer, "Restore the active direct-texture target");
assert.equal(values.get("u_hdShadowPass"), false);
renderer.renderOpaquePass = () => { throw new Error("draw failed"); };
assert.throws(() => plugin.beforeSceneRender(renderer, () => {}), /draw failed/);
assert.equal(values.get("u_hdShadowPass"), false, "Restore shadow state even after a failed draw");
assert.equal(app.target, renderer.textureFramebuffer);
plugin.setEnabled(false);
plugin.beforeSceneRender(renderer, () => {});
assert.equal(values.get("u_hdEnabled"), false);
assert.equal(notifications, 2);
unsubscribe();
plugin.disposeRenderer(renderer);
assert.equal(deleted, 5, "Dispose shadow framebuffer, depth texture and material/placeholder textures");
assert.equal(new HdPlugin().getEnabled(), false, "Persist the disabled state");
plugin.setEnabled(true);
assert.equal(new HdPlugin().getEnabled(), true, "Explicit opt-in persists");

if (process.argv[2]) {
    const bundle = require("esbuild").buildSync({
        entryPoints: [path.resolve(__dirname, "hd-webgl-smoke.ts")], bundle: true, write: false,
        format: "iife", globalName: "hdSmoke", loader: { ".glsl": "text", ".png": "dataurl" },
    }).outputFiles[0].text;
    fs.writeFileSync(process.argv[2], `<!doctype html><title>HD shader check</title><pre id="result">Running</pre><script>
    ${bundle}
    (async () => { try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) throw Error('WebGL2 unavailable');
        const multiDraw = gl.getExtension('WEBGL_multi_draw');
        let count = 0;
        for (const [vertex, fragment] of ${JSON.stringify(programs)}) {
            if (vertex.includes('#define MULTI_DRAW') && !multiDraw) continue;
            const program = gl.createProgram();
            for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
                const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
                gl.attachShader(program, shader);
            }
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
            count++;
        }
        await hdSmoke.run();
        document.getElementById('result').textContent = 'PASS: ' + count + ' shader programs linked; HD on/off pixels and shadow framebuffer verified';
    } catch (error) { document.getElementById('result').textContent = 'FAIL: ' + error; }
    document.querySelector('script').remove(); })();
    </script>`);
}
console.log("117 HD shader, water isolation and lifecycle tests passed");

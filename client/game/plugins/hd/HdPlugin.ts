import { mat4, vec3 } from "gl-matrix";
import PicoGL, { type DrawCall, type Framebuffer, type Program, type Texture } from "picogl";
import type { WebGLOsrsRenderer } from "../../../render/WebGLOsrsRenderer";
import type { ProgramSource } from "../../../render/shaders/ShaderUtil";
import type { ClientPlugin } from "../ClientPluginManager";
import { resolveHdEnvironment } from "./HdEnvironment";
import { createHdProgram } from "./HdShader";
import { collectHdLights } from "./HdLights";
import lighting from "./hd-lighting.glsl";
import { HdMaterials } from "./HdMaterials";

// PicoGL exposes these methods at runtime but omits them from its declarations.
type SceneProgram = Program & { bind(): void; uniform(name: string, value: unknown): void };
const STORAGE_KEY = "xrsps.plugin.hd.enabled";

export class HdPlugin implements ClientPlugin {
    private enabled = false;
    private readonly listeners = new Set<() => void>();
    private readonly renderers = new Map<WebGLOsrsRenderer, {
        programs: SceneProgram[];
        placeholder: Texture;
        materials: HdMaterials;
        shadow?: Texture;
        framebuffer?: Framebuffer;
        shadowPass: boolean;
    }>();
    private readonly shadowMatrix = mat4.create();
    private readonly inverseView = mat4.create();
    private readonly lightPositions = new Float32Array(32 * 4);
    private readonly lightColors = new Float32Array(32 * 4);

    constructor() {
        try { this.enabled = localStorage.getItem(STORAGE_KEY) === "true"; } catch { /* Storage can be unavailable. */ }
    }

    getEnabled = (): boolean => this.enabled;
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    setEnabled = (enabled: boolean): void => {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* Session toggle still works. */ }
        for (const listener of this.listeners) listener();
    };

    transformSceneProgram(source: ProgramSource): ProgramSource {
        return createHdProgram(source, lighting);
    }

    sceneProgramsReady(renderer: WebGLOsrsRenderer, programs: Program[]): void {
        this.disposeRenderer(renderer);
        // A complete sampler is required even when its shader branch is disabled.
        const placeholder = renderer.app.createTexture2D(new Uint8Array([255, 255, 255, 255]), 1, 1, {
            minFilter: PicoGL.NEAREST, magFilter: PicoGL.NEAREST,
        });
        this.renderers.set(renderer, { programs: programs as SceneProgram[], placeholder, materials: new HdMaterials(renderer.app), shadowPass: false });
    }

    configureSceneDrawCall(renderer: WebGLOsrsRenderer, drawCall: DrawCall): void {
        const state = this.renderers.get(renderer);
        if (!state || !state.programs.includes(drawCall.currentProgram as SceneProgram)) return;
        drawCall.texture("u_hdShadowMap", state.shadowPass ? state.placeholder : state.shadow ?? state.placeholder);
        drawCall.texture("u_hdMaterials", state.materials.lookup);
        drawCall.texture("u_hdTextures", state.materials.textures);
    }

    beforeSceneRender(renderer: WebGLOsrsRenderer, drawActors: () => void): void {
        const state = this.renderers.get(renderer);
        if (!state) return;
        const set = (name: string, value: unknown) => {
            for (const program of state.programs) {
                program.bind();
                program.uniform(name, value);
            }
        };
        set("u_hdEnabled", this.enabled);
        set("u_hdShadowPass", false);
        if (!this.enabled) return;
        state.materials.update(renderer.textureIdIndexMap);
        mat4.invert(this.inverseView, renderer.osrsClient.camera.viewMatrix);
        set("u_hdInverseView", this.inverseView);

        const [x, z] = renderer.playerPosUni;
        const environment = resolveHdEnvironment(x, z);
        const pitch = environment.lightPitch * Math.PI / 180;
        const yaw = environment.lightYaw * Math.PI / 180;
        const direction = vec3.fromValues(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
        set("u_hdLightDirection", direction);
        set("u_hdAmbient", environment.ambientColor.map(c => c * environment.ambient * 0.74));
        set("u_hdDirectional", environment.directionalColor.map(c => c * environment.lightStrength * 0.9));
        set("u_hdFogColor", environment.fogColor);
        const fogEnd = Math.max(1, renderer.getFrameRenderDistanceTiles());
        set("u_hdFog", [environment.fogDepth, environment.fogScale, fogEnd]);
        set("u_hdGroundFog", [environment.groundFogStart / 128, environment.groundFogEnd / 128, environment.groundFogOpacity]);
        set("u_hdGrading", [1.12, 1, 0.9, 0]);
        set("u_hdSpecular", 1);
        const count = collectHdLights(renderer, this.lightPositions, this.lightColors, Date.now());
        set("u_hdLightCount", count);
        set("u_hdLightPositions[0]", this.lightPositions);
        set("u_hdLightColors[0]", this.lightColors);

        if (!state.shadow) {
            state.shadow = renderer.app.createTexture2D(2048, 2048, {
                internalFormat: PicoGL.DEPTH_COMPONENT24, type: PicoGL.UNSIGNED_INT,
                minFilter: PicoGL.NEAREST, magFilter: PicoGL.NEAREST,
                wrapS: PicoGL.CLAMP_TO_EDGE, wrapT: PicoGL.CLAMP_TO_EDGE,
            });
            state.framebuffer = renderer.app.createFramebuffer().depthTarget(state.shadow);
        }
        const target = vec3.fromValues(x, renderer.sampleHeightAtExactPlane(x, z, renderer.getPlayerRawPlane()), z);
        const eye = vec3.scaleAndAdd(vec3.create(), target, direction, 100);
        const view = mat4.lookAt(mat4.create(), eye, target, Math.abs(direction[1]) > 0.99 ? [0, 0, 1] : [0, -1, 0]);
        const extent = Math.min(48, fogEnd);
        mat4.multiply(this.shadowMatrix, mat4.ortho(mat4.create(), -extent, extent, -extent, extent, 1, 220), view);
        set("u_hdShadowMatrix", this.shadowMatrix);
        set("u_hdShadowStrength", 0.9);

        const viewport = renderer.gl.getParameter(PicoGL.VIEWPORT) as Int32Array;
        const scissor = renderer.gl.isEnabled(PicoGL.SCISSOR_TEST);
        const blend = renderer.gl.isEnabled(PicoGL.BLEND);
        const framebuffer = renderer.shouldUseDirectTextureScenePass() ? renderer.textureFramebuffer! : renderer.framebuffer!;
        state.shadowPass = true;
        set("u_hdShadowPass", true);
        try {
            renderer.app.drawFramebuffer(state.framebuffer!);
            renderer.gl.drawBuffers([PicoGL.NONE]);
            renderer.app.viewport(0, 0, 2048, 2048).disable(PicoGL.SCISSOR_TEST).disable(PicoGL.BLEND).depthMask(true);
            renderer.gl.clear(PicoGL.DEPTH_BUFFER_BIT);
            renderer.renderOpaquePass();
            renderer.renderTransparentPass();
            drawActors();
        } finally {
            state.shadowPass = false;
            set("u_hdShadowPass", false);
            renderer.app.drawFramebuffer(framebuffer);
            renderer.app.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
            if (scissor) renderer.app.enable(PicoGL.SCISSOR_TEST);
            if (blend) renderer.app.enable(PicoGL.BLEND);
        }
    }

    disposeRenderer(renderer: WebGLOsrsRenderer): void {
        const state = this.renderers.get(renderer);
        state?.framebuffer?.delete();
        state?.shadow?.delete();
        state?.placeholder.delete();
        state?.materials.dispose();
        this.renderers.delete(renderer);
    }
}

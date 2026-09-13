import PicoGL from "picogl";
import { mat4 } from "gl-matrix";
import { HdPlugin } from "../game/plugins/hd/HdPlugin";

/** Run in an actual WebGL2 browser; bundled by hd-plugin.test.ts's optional HTML output. */
export async function run(): Promise<void> {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const app = PicoGL.createApp(canvas);
    const gl = app.gl as WebGL2RenderingContext;
    const plugin = new HdPlugin();
    plugin.setEnabled(false);
    const sources = plugin.transformSceneProgram([
        `#version 300 es
        precision highp float;
        layout(location=0) in vec3 a_position;
        uniform mat4 u_viewMatrix;
        void main() {
            vec4 viewPos = u_viewMatrix * vec4(a_position, 1.0);
            gl_Position = viewPos;
        }`,
        `#version 300 es
        precision highp float;
        uniform mat4 u_viewMatrix;
        uniform vec2 u_playerPos;
        uniform vec4 u_skyColor;
        const uint v_texId = 0u;
        const vec2 v_texCoord = vec2(0.0);
        out vec4 fragColor;
        void main() {
            vec4 textureColor = vec4(0.3, 0.3, 0.3, 1.0);
            float alpha = textureColor.a;
            float banding = 1.0;
            vec3 surface = textureColor.rgb;
            float fog = 0.0;
            vec3 finalRgb = mix(surface, u_skyColor.rgb, fog);
            fragColor = vec4(finalRgb, alpha);
        }`,
    ]);
    const [program] = await app.createPrograms(sources);
    const vertexBuffer = app.createVertexBuffer(PicoGL.FLOAT, 3, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]));
    const vao = app.createVertexArray().vertexAttributeBuffer(0, vertexBuffer);
    const color = app.createTexture2D(32, 32);
    const target = app.createFramebuffer().colorTarget(0, color);
    const draw = app.createDrawCall(program, vao).uniform("u_viewMatrix", mat4.create()).uniform("u_playerPos", [0, 0]).uniform("u_skyColor", [0, 0, 0, 1]);
    const renderer = {
        app, gl, playerPosUni: [0, 0], textureIdIndexMap: new Map(), mapManager: { visibleMapCount: 0 },
        osrsClient: { camera: { viewMatrix: mat4.create() } },
        getFrameRenderDistanceTiles: () => 25, getPlayerRawPlane: () => 0,
        sampleHeightAtExactPlane: () => 0, shouldUseDirectTextureScenePass: () => true,
        framebuffer: target, textureFramebuffer: target,
        renderOpaquePass() { plugin.configureSceneDrawCall(renderer as any, draw); draw.draw(); },
        renderTransparentPass() {},
    };
    plugin.sceneProgramsReady(renderer as any, [program]);
    const pixel = () => {
        app.drawFramebuffer(target).viewport(0, 0, 32, 32);
        renderer.renderOpaquePass();
        app.readFramebuffer(target);
        const bytes = new Uint8Array(4);
        gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw Error("WebGL draw error " + error);
        return Array.from(bytes).join(",");
    };
    plugin.beforeSceneRender(renderer as any, () => {});
    const disabled = pixel();
    plugin.setEnabled(true);
    plugin.beforeSceneRender(renderer as any, () => {});
    const shadow = (plugin as any).renderers.get(renderer).framebuffer;
    if (shadow.getStatus() !== gl.FRAMEBUFFER_COMPLETE) throw Error("Incomplete shadow framebuffer");
    const enabled = pixel();
    if (enabled === disabled) throw Error("HD did not change the rendered pixel");
    plugin.setEnabled(false);
    plugin.beforeSceneRender(renderer as any, () => {});
    if (pixel() !== disabled) throw Error("Disabling HD did not restore the original pixel");
    plugin.disposeRenderer(renderer as any);
    draw.delete(); vao.delete(); vertexBuffer.delete(); program.delete(); target.delete(); color.delete();
}

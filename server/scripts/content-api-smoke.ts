// Exercises the content API end to end: a plugin registers its interface definition, the
// world resources are routed and answered from the definition files, and both are served
// with an ETag that a second request can revalidate against.
// Usage: TS_NODE_COMPILER_OPTIONS='{"target":"es2020"}' yarn ts-node ./scripts/content-api-smoke.ts
import { strict as assert } from "assert";
import path = require("path");
import { CachePipeline } from "../src/main/typescript/elvarg/game/cache/CachePipeline";
import { ContentApi } from "../src/main/typescript/elvarg/net/http/ContentApi";
import { CustomInterfaceRegistry } from "../src/main/typescript/elvarg/game/interfaces/CustomInterfaceRegistry";

const Commands = require("../plugins/interface/Commands.plugin");

async function main() {
    await CachePipeline.initialize(path.resolve(__dirname, ".."));

    const api = new Proxy<any>(
        {
            registerContentEndpoint: (name: string, handler: any) =>
                ContentApi.register(name, handler),
            registerCustomInterface: (definition: any) =>
                CustomInterfaceRegistry.register(definition),
        },
        { get: (target, property) => (target as any)[property] ?? (() => undefined) }
    );
    Commands.register(api);

    // Exercise the editor endpoint through the real router without booting Server.ts.
    const pluginPath = path.resolve(__dirname, "../plugins/world/EditModeApi.plugin.js");
    const pluginModule = { exports: {} as any };
    const pluginRequire = require("module").createRequire(pluginPath);
    const server = { PRODUCTION: true };
    require("vm").runInNewContext(require("fs").readFileSync(pluginPath, "utf8"), {
        module: pluginModule,
        process,
        require: (id: string) => id.endsWith("/Server") ? { Server: server } : pluginRequire(id),
    });
    pluginModule.exports.register(api);
    assert.equal(ContentApi.resolve("GET", "/api/world")?.status, 404);
    server.PRODUCTION = false;
    pluginModule.exports.register(api);
    const world = ContentApi.resolve("GET", "/api/world")!;
    assert.equal(world.status, 200);
    assert.deepEqual(JSON.parse(world.body),
        require("../src/main/typescript/elvarg/game/definition/WorldDefinition").getWorldDefinition());
    assert.equal(ContentApi.resolve("GET", "/api/world", world.headers.ETag)?.status, 304);
    assert.equal(ContentApi.resolve("PUT", "/api/world")?.status, 405);
    assert.equal(ContentApi.resolve("GET", "/api/world/nope")?.status, 404);

    for (const [resource, file] of [["shops", "shops.json"], ["npc-interactions", "npc_interactions.json"]]) {
        const response = ContentApi.resolve("GET", `/api/world/${resource}`)!;
        assert.equal(response.status, 200);
        assert.deepEqual(JSON.parse(response.body), JSON.parse(require("fs").readFileSync(`data/definitions/${file}`, "utf8")));
        assert.equal(ContentApi.resolve("PUT", `/api/world/${resource}`)?.status, 405);
    }

    const notFound = ContentApi.resolve("GET", "/api/nope");
    assert.equal(notFound?.status, 404, "unknown resources must 404");
    assert.equal(ContentApi.resolve("GET", "/regions"), null, "non-api urls are not ours");

    const posted = ContentApi.resolve("POST", "/api/world");
    assert.equal(posted?.status, 405, "these resources are read-only");
    assert.equal(posted?.headers.Allow, "GET, HEAD", "405 must say what is allowed");

    // The interface definition is a resource, not something pushed on every open.
    const definition = ContentApi.resolve("GET", "/api/interfaces/30004");
    assert.equal(definition?.status, 200, "the interface definition must be addressable");
    const parsed = JSON.parse(definition!.body) as { groupId: number; widgets: unknown[] };
    assert.equal(parsed.groupId, 30004);
    assert.ok(parsed.widgets.length > 0, "the widget group travels with the definition");

    const etag = definition!.headers.ETag;
    assert.ok(etag, "definitions must carry an ETag so the browser can revalidate");
    const revalidated = ContentApi.resolve("GET", "/api/interfaces/30004", etag);
    assert.equal(revalidated?.status, 304, "an unchanged definition revalidates to 304");
    assert.equal(revalidated?.body, "", "304 carries no body");

    const missing = ContentApi.resolve("GET", "/api/interfaces/999999");
    assert.equal(missing?.status, 404, "an unknown interface is a 404");

    console.log(
        `content api ok: /api/world -> ${world.body.length} bytes; /api/interfaces/30004 -> ` +
            `${parsed.widgets.length} widgets, ${definition!.body.length} bytes, revalidates 304`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

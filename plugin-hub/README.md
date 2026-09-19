# Relative Plugin Hub

Drop custom server plugins here as `*.plugin.js`. The sync script copies them into the primary TypeScript server's `server/plugins/custom-hub/` directory, which is discovered automatically at server startup.

A plugin exports either the object directly or `default`, with:

```js
module.exports = {
  name: 'MyFeature',
  dependsOn: [],
  register(api) {
    api.onServerStartup(() => console.info('[MyFeature] ready'));
  }
};
```

The upstream plugin manager already provides guarded registration, dependency ordering, disabled-plugin support, and per-hook error isolation. Keep plugins small, validate input, and do not load untrusted code. Disable a plugin by adding its normalized name to `tsps-primary/server/data/definitions/world.json` under `disabledPlugins`.

Run from the workspace root:

```powershell
.\scripts\sync-plugins.ps1
```

The hub is intentionally relative to this workspace; no global package install or external service is needed.

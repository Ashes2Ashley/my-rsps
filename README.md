# TSPS - TypeScript RuneScape Private Server

A browser-based Old School RuneScape private server with a TypeScript/WebGL client and TypeScript game server.

## Packages

- [`client/`](client/) — browser client (Forked from [xRSPS](https://github.com/xrsps/xrsps-typescript))
- [`server/`](server/) — game server (Official continuation of our [Elvarg](https://github.com/RSPSApp/elvarg-rsps) fork - Ported to TypeScript)

## Quick start

Install [Node.js LTS](https://nodejs.org/en/download) first. No separate Yarn installation is needed.

```bash
cd elvarg-typescript
corepack yarn setup
corepack yarn start
```

Open <http://localhost:3000>. The first start downloads the game cache automatically.

## Publish your world

Create a server token at [RSPS.app](https://rsps.app/) under **Settings → Server tokens**, then add it to `.env` in the repository root:

```dotenv
WEBRTC_WORLD_ID=my-world
WEBRTC_WORLD_TOKEN=paste-your-token-here
```

Run `corepack yarn start`. Your world appears in the World list once it registers. Keep the token private.

## Credits

We want to thank Astrul, Detuks and all the contributers of both the legacy Java project and the TypeScript continuation.

## Legal

This fan project is not affiliated with Jagex Ltd. Old School RuneScape and related assets and trademarks belong to their respective owners.

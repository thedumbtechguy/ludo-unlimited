# Ludo Unlimited

Ludo with Ghanaian kicks, for one device or online with friends.

- `packages/engine`: the rules.
- `packages/web`: the app (React and Vite).
- `packages/server`: the online rooms (a Cloudflare Worker with a Durable Object per room). It also serves the built app.

## Running locally

Use Node 22.

    npm install
    npm run dev -w @ludo/server   # rooms API on :8787
    npm run dev -w @ludo/web      # the app on :5173, /api proxied to :8787

The rooms run locally in `wrangler dev`, with no Cloudflare login.

## Tests

    npm run typecheck
    npm test
    npm run e2e -w @ludo/web      # starts both dev servers itself

## Deploying

Cloudflare Workers Builds deploys `main`:
- Root directory: the repo root (`/`), so the workspaces install
- Build command: `npm run build -w @ludo/web`
- Deploy command: `npx wrangler deploy --config packages/server/wrangler.jsonc`
- Non-production branch deploy command: `npx wrangler versions upload --config packages/server/wrangler.jsonc`, or turn non-production builds off

Preview URLs are off: Workers with Durable Objects don't get them.

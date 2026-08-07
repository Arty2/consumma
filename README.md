# Consumma

A shared checklist that the server cannot read. Two or more people connect to
the same list with a short code; everything is encrypted in the browser, and
what reaches the server is ciphertext and a room id derived from the same code.

Black on white, handwritten, no chrome. The sheet is a sheet, and the only
words on it are the ones someone wrote.

## Where this is

Complete through M7. The app runs, syncs, installs to a home screen and works
with the aeroplane mode on. What is left is the deployment itself — the Vercel
project and Blob store were deferred until they were needed, and the checklist
is below.

## Running it

```
pnpm install
pnpm dev
```

| Command          | Does                                                |
| ---------------- | --------------------------------------------------- |
| `pnpm check`     | `svelte-check` against the strict tsconfig          |
| `pnpm lint`      | Prettier and ESLint                                 |
| `pnpm gates`     | The rules a linter cannot enforce (see below)       |
| `pnpm test:unit` | Vitest, including the merge property tests from M1  |
| `pnpm test:e2e`  | Playwright against a production build on port 4173  |
| `pnpm test`      | Gates, unit tests and end-to-end tests in one go    |
| `pnpm build`     | Production build through `@sveltejs/adapter-vercel` |

CI runs all of them on every push and pull request, plus
`pnpm audit --prod --audit-level high`. Nothing deploys from Actions.

### The gates

`scripts/gates.sh` fails the build on things that would otherwise only be
written down: any route from a string to markup (`{@html}`, `innerHTML`,
`eval(`, and the rest), an API route importing from `src/lib/crypto`, a
`PUBLIC_` environment variable whose name looks like a secret, a committed
raster asset or non-woff2 font, and shadows, background-images or `<img>`
elements anywhere in `src`.

The PWA's raster icons are the one exception, and they are drawn by
`scripts/icons.ts` at build time from the same primitives as everything else on
the sheet. The gate exempts `static/icons` only while that directory is
gitignored — otherwise the exemption would become the place to hide an image.

## Two things you have to be told

Neither is discoverable by looking at the sheet, which is the accepted cost of
keeping it clean.

- **Long-press a checkbox to set a task half done.** Tapping toggles it between
  to-do and done; holding for about half a second gives you the third state.
  Holding a half-done task returns it to to-do. On a keyboard, `Space` toggles
  and `Shift+Space` sets half.
- **Long-press the text of a row to pick it up and drag it**, including into
  another group. There is no drag handle. The checkbox keeps its own
  long-press, so the two gestures never collide.

## What it does not do

- **Lose the code, lose the list.** There is no account, no email, no recovery.
  EXPORT copies the whole list to the clipboard as markdown, and it is the only
  backup this app has.
- **A shared code cannot be taken back.** Anyone holding it has full read and
  write access. DELETE only clears your own device, so if a code leaks the only
  remedy is for everyone to agree on a fresh one and join that instead. There is
  no revocation and no per-person permissions.
- **Sync happens when you ask for it.** Tapping SYNC pushes your changes and
  pulls theirs; nothing moves on its own. An edit you never sync reaches nobody
  and is lost if the device is. The mark in the sheet's top-right corner is
  hollow whenever you have unsent changes.
- **A list nobody edits for six months is deleted.** Editing keeps it alive;
  reading does not.
- **End-to-end encryption protects the data at rest**, not against the origin
  serving the JavaScript. That is true of every web app of this shape and is
  worth being clear-eyed about.

## Deployment — to be done at M4

Nothing in M0–M3 touches a server, so the Vercel side is stood up in one sitting
when M4 needs it. What it needs:

1. **Import the repository** into a new Vercel project on the Hobby plan.
   Framework preset SvelteKit; the build command and output directory are
   detected. Production deploys from `main`, previews from pull requests.
2. **Create a Blob store** and connect it to the project. This injects
   `BLOB_READ_WRITE_TOKEN`. Keep the store private; nothing but the function
   needs to read it.

   Preview and production should ideally get **separate stores**. If they share
   one, they are still isolated: `src/lib/server/env.ts` reads Vercel's own
   `VERCEL_ENV` and prefixes blob paths with `preview/` or `dev/`, leaving
   production unprefixed. Nothing to configure. Note that Vercel runs crons in
   production only, so preview blobs are never swept and accumulate — which is
   the argument for separate stores rather than against the prefix.

3. **Add `CRON_SECRET`** as a private environment variable, and only that one.
   Generate it with `openssl rand -hex 32` and add it under Project Settings →
   Environment Variables with exactly that name — Vercel looks for it by name
   and sends `Authorization: Bearer <value>` on every cron invocation. Until it
   is set, `/api/cron/sweep` returns 401 and the daily sweep deletes nothing.

   `BLOB_READ_WRITE_TOKEN` is not set by hand: connecting the Blob store in
   step 2 injects it. If you find yourself typing it in, the store is not
   connected.

   There are no `PUBLIC_` variables in this project, by design — the browser
   never learns the blob host, and `pnpm gates` fails the build if a
   secret-shaped one appears. See `.env.example`; for local development,
   `vercel link` then `vercel env pull .env.local`.

4. **Confirm the free-tier numbers** at `vercel.com/docs/limits` before relying
   on them. Hobby is personal, non-commercial use only; if this ever earns
   money it moves to Pro. Exceeding a Blob limit pauses Blob for about 30 days
   rather than billing you.
5. **Protect `main`**: green CI required, squash merges, conventional commit
   titles.
6. **Check the deployed preview** for the things only a deploy can show: the
   response headers from `vercel.json` (asserted against the file in
   `tests/headers.spec.ts`, but not live until deployed), Lighthouse on mobile,
   and its installability audit.

The cron entry for the daily sweep is already in `vercel.json`; it needs
`CRON_SECRET` set before it will do anything but return 401.

The daily sweep (`/api/cron/sweep`, one run a day, guarded by a constant-time
`CRON_SECRET` check) is added to `vercel.json` in the same milestone.

## Licence

Fonts are Patrick Hand and Caveat, both SIL OFL, self-hosted as latin-subset
woff2 from M2.

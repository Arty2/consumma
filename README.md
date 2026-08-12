# /consumma

A shared checklist that the server cannot read. Two or more people connect to
the same list with a short code; everything is encrypted in the browser, and
what reaches the server is ciphertext and a room id derived from the same code.

Black on white, handwritten, no chrome. The sheet is a sheet, and the only
words on it are the ones someone wrote.

- Project page: [heracl.es/consumma](https://heracl.es/consumma)
- Demo: [consumma.vercel.app](https://consumma.vercel.app)
- Source: [github.com/arty2/consumma](https://github.com/arty2/consumma)

## Where this is

Complete through M7, and deployed. The app runs, syncs between devices,
installs to a home screen and works with the aeroplane mode on.

The deployment checklist below is kept as a runbook rather than a to-do: it is
what a second environment needs, and what to check when one of them stops
working.

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
| `pnpm quick`     | Gates, types and unit tests — no browser, no build  |
| `pnpm test:unit` | Vitest, including the merge property tests from M1  |
| `pnpm test:e2e`  | Playwright against a production build on port 4173  |
| `pnpm test`      | Gates, unit tests and end-to-end tests in one go    |
| `pnpm build`     | Production build through `@sveltejs/adapter-vercel` |

`pnpm quick` is the one to run while working. It answers in about a quarter of
a minute because it never starts a browser; `pnpm test` is what to run before
asking for a change to land. Nothing deploys from Actions.

### Open a pull request as a draft

CI is two jobs, and which of them runs is decided by whether the pull request
is a draft.

|                              | Runs                                                                                          | Takes |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ----- |
| Draft pull request           | `check` — gates, types, lint, unit                                                            | ~40s  |
| Ready for review, and `main` | `check` **and** `full` — the above plus Playwright, the bundle budget and `pnpm audit --prod` | ~90s  |

So **open it as a draft and leave it there while you work**. Every push gets
the short answer, which is the one that catches the ordinary mistake: a type
error, a lint failure, a broken gate, a unit test. Mark it ready for review
when you want it merged, and the whole suite runs before it can be.

Marking it ready is not optional politeness — `full` is the only thing that
runs Playwright, so a pull request that never leaves draft has never had its
end-to-end tests run. `main` always runs both, which is the net under all of
this.

The full suite can also be asked for by hand from the Actions tab
(`workflow_dispatch`) without marking anything ready.

Two more things decide whether CI runs at all. A commit touching only `.md`
files is skipped, since prose cannot break a build — so a README-only change
shows no checks, and that is correct rather than stuck. And a newer push
cancels the run still going for the older one, because it says everything the
older one did.

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

## Deployment

The Vercel side stands up in one sitting. What it needs:

1. **Import the repository** into a new Vercel project on the Hobby plan.
   Framework preset SvelteKit; the build command and output directory are
   detected. Production deploys from `main`, previews from pull requests.
2. **Create a Blob store** and connect it to the project. This injects
   `BLOB_READ_WRITE_TOKEN`. Keep the store **private** — the app reads and
   writes with `access: 'private'`, and nothing but the function ever needs to
   read it. A public store would leave the ciphertext one request away from
   anyone who can guess a room id, which is derived from the code.

   Preview and production should ideally get **separate stores**. If they share
   one, they are still isolated: `src/lib/server/env.ts` reads Vercel's own
   `VERCEL_ENV` and prefixes blob paths with `preview/` or `dev/`, leaving
   production unprefixed. Nothing to configure. Note that Vercel runs crons in
   production only, so preview blobs are never swept and accumulate — which is
   the argument for separate stores rather than against the prefix.

   **Check it before trusting it.** A deployment with no store connected fails
   in a way that reads as healthy from the outside — the app says it cannot
   reach the list, which sounds like a network problem, and a `GET` answers a
   perfectly ordinary 404. The write path is the one that tells the truth:

   ```
   ROOM=$(openssl rand -hex 16)
   curl -i https://<your-deployment>/api/room/$ROOM
   curl -i -X PUT https://<your-deployment>/api/room/$ROOM \
     -H 'Content-Type: application/json' -d '{"baseV":0,"blob":"AA=="}'
   ```

   Healthy is `404` then `200 {"v":1}`, both carrying `Cache-Control: no-store`.
   `404` then `500` means the store is not connected. A `404` without the
   `no-store` header is Vercel's own not-found, not ours — the route did not
   deploy.

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

One face, everywhere: **Graphe**, drawn by the owner of this project. Titles and
body differ by size and caps, not by typeface.

Graphe is **not** an open-licence font. It is used here by the person who made
it, and no licence to redistribute it comes with this repository. A fork that
publishes anything has to substitute its own face — the licence has to permit
webfont embedding _and_ redistribution, since self-hosting on a public site is
both, which is what rules out the common "free for personal use" terms.

Swapping is a two-line change: drop a woff2 into `static/fonts`, point the
single `@font-face` in `src/app.css` at it, and update the preload in
`src/app.html`. A stale preload fails the prerender rather than shipping a dead
link, so the second line cannot be forgotten quietly.

Expect to retune `size-adjust` in that `@font-face` — it exists so a face drawn
on a different body can be dropped in without rewriting every size in the
stylesheet, and its current value is calibrated to Graphe.

Known gap: Graphe has no `[`, `]`, `\` or `Ϋ`. Those fall back to the generic
cursive stack. The first three reach the screen only in text a person types —
the markdown in the IMPORT box flips to a summary as soon as it parses — so the
visible case is a task titled something like `Deposit [urgent]`. `Ϋ` is the
capital of `ΰ`, so it appears only when a word containing that letter is shown
in caps.

## Greek

The sheet is set in caps in CSS, and uppercasing Greek is language-dependent:
Greek drops the tonos in capitals — ΚΑΦΕΣ, not ΚΑΦΈΣ. Browsers apply that rule
only when told the text is Greek, so `src/lib/doc/lang.ts` marks any text
containing a Greek letter `lang="el"`.

Without it the result is not just unidiomatic but broken — Chrome renders
μαΐστρος as ΜΑΪ́ΣΤΡΟΣ, dialytika plus a stranded combining acute. The accents
themselves are untouched: what is stored, exported and read aloud keeps exactly
what was typed, as with the uppercase itself.

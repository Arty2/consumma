# Consumma

Shared end-to-end encrypted checklist. SvelteKit 2 / Svelte 5 runes / TypeScript strict.

## Commands

pnpm dev · pnpm check · pnpm lint · pnpm gates · pnpm test · pnpm test:e2e · pnpm build · pnpm budget

`pnpm gates` runs `scripts/gates.sh`, which enforces the rules below that a
linter cannot. CI runs it first, before anything else.

## Non-negotiable

- The share code, derived keys, and plaintext never leave the browser. Server sees ciphertext only.
- The code never goes in a URL — not a query, not a fragment, not the native share link.
- Server code must not import from src/lib/crypto.
- The browser only ever talks to our own origin. No cross-origin requests, no third-party scripts, no CDN fonts — this is what keeps the CSP strict. Nothing carries a blob host URL to the client.
- Palette is #000 and #fff. No greys, no colour, no shadows, ever.
- No image files, no icon fonts, no CSS borders on drawn elements. Every mark is an inline SVG path from src/lib/draw, seeded by a stable id so it never re-jitters.
- Merge logic in src/lib/doc/merge.ts is pure and must stay commutative, associative, idempotent. It takes no clock — skew clamping and tombstone GC are separate functions applied by the sync and write paths.
- Collapsed state is local, never synced.
- CLEAR sweeps done tasks only. DELETE is local-only and never calls the server. Undo re-stamps forward, never rewinds.
- Two long-presses, separated by hit area: on the checkbox it sets half, on the row text it starts a drag. Never merge them.
- UI labels are uppercased in CSS only. Stored titles and markdown exports keep the casing the user typed.
- Anything drawn that sits beside capitals lifts by `--cap-lift`. Graphe's caps ride high in their own line box, so a centred checkbox reads low against them. The value is measured in a browser, not derived — retune it with the face.
- Anything showing user text in caps sets `lang={langOf(text)}` (src/lib/doc/lang.ts). Greek drops the tonos in capitals and browsers only apply that with the language declared — without it Chrome renders μαΐστρος as ΜΑΪ́ΣΤΡΟΣ. Never uppercase in JS to work around it; that would break the CSS-only rule above.
- Limits: 100 chars/task, 100 tasks, 50 chars/group title, 20 groups, 128 KB blob. Enforce at input; merge never discards to fit.
- Never {@html}, never innerHTML, never eval. `pnpm gates` fails on them.
- All user text is sanitised at the input boundary (src/lib/doc/clean.ts): NFC, no control or bidi characters, capped length in code points.

## Decisions that override the build plan

The build plan is the specification; these were settled after it was written and win where they conflict.

- **`CODE_LENGTH = 12`**, not 8. 48 bits. The salt is frozen at `consumma:v1`. The code is displayed grouped — `5e6b 7c1a 93f2` — for reading aloud; what is stored is bare lowercase hex, and the SYNC input strips whitespace.
- **Nothing is on the page but the sheet and one button.** A burger in the sheet's corner, which becomes an arrow when edits are unsent; it opens a side menu holding sync, share, join, IMPORT/EXPORT/CLEAR/DELETE and the credit. No opening scroll — nothing sits above the sheet.
- The menu closes before any panel opens over it. Two focus traps at once is a keyboard trap. `src/lib/a11y/trap.ts` is shared by the menu and the modal; do not write a second copy.
- Sync copy comes from `src/lib/sync/status.ts`, never inline. Two lines: how much is waiting, then why it still is. Being unreachable is a condition, not an error, and it never hides the count.
- **SHARE and COPY hand over one payload** carrying the link and the code together; either half alone is useless. It goes in `navigator.share`'s `text` with no `url` field, so no target can keep one and drop the other. The link stays bare.
- **Sync is entirely manual.** There is no poll interval, no visibilitychange/focus/online trigger, no push debounce, and no queue that flushes on reconnect. One `syncNow()` runs on the SYNC tap and nowhere else, doing both directions, with a 10-second cooldown. The 15-second tick in SyncButton advances the clock and recomputes the mark; it never syncs, and nothing may be added to it that does. §5's `head()` read path and `cacheControlMaxAge: 0` therefore stand as written — the operations budget is no longer under pressure.
- An unsynced edit reaches nobody and dies with the device. Three things carry that, and no fourth is added: the corner button shows an outbox arrow whenever local edits are unsent, the SYNC panel names how many, and the DELETE confirm says so. No nagging, no auto-sync, no banner.
- Being unable to reach the list is a condition, not an error. It is drawn as a crossed circle on the corner button and it outranks the arrow. It is set by an attempt that actually failed and cleared only by one that succeeded — never inferred from `navigator.onLine`, which says the device has a network, not that the list is at the end of it.
- **No `PUBLIC_BLOB_BASE`** and no `/api/room/[roomId]/version` route. Both are leftovers from a draft where the browser read the CDN directly.
- Stamps use a per-device monotonic clock, `t = max(Date.now(), lastT + 1)`, persisted beside `clientId`. Without it two edits from one device in one millisecond collide on `(t, c)` and merge stops being commutative.
- After a successful `PUT`, re-`GET` once and confirm our stamps came back; if not, merge and retry, bounded at 5 attempts with jittered backoff. Vercel Blob has no compare-and-set, so this is what actually makes a lost write self-healing.
- Crypto envelope is `base64(0x01 ‖ iv ‖ ciphertext)` and the plaintext is always deflate-raw. Compression cannot be optional — a reader cannot tell the two apart — and the version byte buys a future change without orphaning lists.
- Markdown: export `- [~]` for half; import accepts `[ ]`, `[x]`, `[X]`, `[~]`, `[/]`, `[-]`, and a bare bullet as to-do.
- QR code in SHARE and a "move everyone to a new code" flow are **out of scope**. Work stops at M7.
- CSP names two framework Trusted Types policies, `svelte-trusted-html` (Svelte's own template writes) and `sveltekit-trusted-url` (the service worker registration). Chrome will not hydrate without the first; SvelteKit will not build without the second. `style-src` carries one pinned hash under `'unsafe-hashes'` for SvelteKit's `#svelte-announcer`, which is framework markup we do not author — that is not `'unsafe-inline'`, and e2e/csp.e2e.ts fails on any console error if it drifts.
- The ETag on a room is the document's own version, never the blob's upload time and size: two writes in one millisecond with same-length JSON collide, and the second is reported unchanged.
- Client JavaScript stays under 60 KB gzipped (`pnpm budget`, enforced in CI).
- PWA icons are drawn by scripts/icons.ts at build time into static/icons, which is gitignored. The asset gate exempts that directory only while it stays gitignored.
- The page is prerendered (`prerender = true` in `src/routes/+layout.ts`). Only `/api/*` is dynamic.
- `src/lib/server/store.ts` is the only file that imports `@vercel/blob`.
- One typeface, everywhere — §6's two faces are down to one. There is exactly one `@font-face` in src/app.css and one variable, `--hand`, that names it; titles and body separate by size and caps. The face is Graphe, the owner's own and not open-licensed; a fork that publishes must substitute its own, licensed for webfont embedding and redistribution.
- Scale corrections for the face live in `size-adjust`/`ascent-override`/`descent-override` on that one `@font-face`, never spread across `--size-*`. Graphe is drawn on a much larger body than the rem values assume. Swapping the face means retuning those three and the preload in src/app.html — a stale preload fails the prerender rather than shipping a dead link.
- Graphe has no `[`, `]` or `\`; they fall back deliberately. Never rewrite the markdown checkbox tokens to work around it — the export has to stay readable by other apps.

## Style

- Svelte 5 runes ($state/$derived/$effect), no legacy stores.
- No CSS framework, no component library, no crypto library.
- Config lives in `vite.config.ts` — this scaffold has no `svelte.config.js`. `sveltekit()` takes the kit config directly.
- Every new module gets a test before it gets wired to the UI.
- Relative imports inside src/lib/draw use explicit `.ts` specifiers, because scripts/icons.ts runs them through Node's type stripping, which does not resolve extensionless paths.
- Playwright never reuses an existing preview server. A stale one serves an old build and every failure then points at the wrong thing.

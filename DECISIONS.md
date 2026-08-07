# Decisions

What was settled, and why. Build to these; don't relitigate them.

Numbers in brackets are the section of the build plan a decision came from.

## Settled before the build

1. **DELETE removes the list from this device only.** No server call, no
   revocation. The confirm shows the code first, because that screen is the
   last place on the device it exists. [§12.1]
2. **CLEAR sweeps `done` tasks and only those.** Half-done stays. A confirm
   _and_ a ten-second undo: the confirm stops the accident, the undo covers the
   change of mind. [§12.2, §12.16]
3. **Tap toggles to-do and done; long-press sets half.** `Shift+Space` is the
   keyboard equivalent. [§12.3]
4. **Joining with local tasks asks whether to merge or discard.** Never
   silently. [§12.5]
5. **Reordering is long-press and drag, with no handle.** The checkbox keeps
   its own long-press, so the two gestures are separated by hit area rather
   than by timing. [§12.6]
6. **IMPORT and EXPORT are clipboard-only markdown**, `##` for groups. Import
   adds by default and offers replace; duplicates in the same group are
   skipped and counted. [§12.7]
7. **Labels are uppercased in CSS only.** A group typed as "Weekend jobs" still
   exports as "Weekend jobs". [§12.8]
8. **Limits: 100 characters per task, 100 tasks, 50 characters per group title,
   20 groups, 128 KB per blob.** Enforced on input, never by discarding in
   merge. [§12.9]
9. **Six-month expiry, swept by a daily cron.** Editing keeps a list alive;
   reading does not. [§12.10]
10. **Storage is one JSON file per list in Vercel Blob.** No database, no rate
    limiter, no atomic compare-and-set. [§12.12]
11. **Consummatum.** When the last open task is ticked, the toast reads
    _Consummatum_. Once, no animation, and never on an empty sheet. [§12.13]
12. **No chrome.** No app name on screen, no add buttons, no tooltips, no
    empty-state copy. Adding is an empty checkbox; a new group is an underlined
    `…` in header type. [§12.14]
13. **Installable, with icons drawn at build time** so no raster asset is ever
    committed. [§12.15]
14. ~~**The app opens scrolled** so the torn top edge sits at the viewport
    top.~~ [§12.17 — superseded by 21]
15. ~~**SHARE fires the native share sheet first**, then opens the modal.~~
    [§12.18 — superseded by 22; the bare URL survives]
16. **One hand-rolled modal component**: full-white panel, swipe-down to
    dismiss, `✕`, Escape. Never `window.confirm()`. [§12.19]

## Settled during the build

17. **`CODE_LENGTH = 12`, not 8.** Forty-eight bits. Everything goes through
    our own origin, but there is no rate limiter behind it, so guessing is
    bounded only by request rate and PBKDF2 cost — at 32 bits that is days of
    work for someone determined. Twelve characters make it roughly 65,000 times
    more. The salt stays frozen at `consumma:v1`. [reopened §12.20]

18. **Sync is entirely manual.** No poll interval, no visibility or reconnect
    triggers, no push debounce, no queue that flushes. One `syncNow()` on the
    SYNC tap, doing both directions, behind a ten-second cooldown.

    Polling was the expensive part — one blob operation every eight seconds per
    open tab, about 10,800 a day for a tab left visible — and pushing without
    being asked is what turns a shared list into something that happens to you.
    The cost is real and is stated rather than designed around: an edit nobody
    syncs reaches nobody and dies with the device. Three things already in the
    design carry it, and no fourth was added — the status mark is hollow
    whenever edits are unsent, the SYNC panel names how many, and the DELETE
    confirm says so.

19. **QR code in SHARE and a "move everyone to a new code" flow are out of
    scope.** A leaked code has no remedy but everyone joining a new one, and the
    README says so. [closed §12.21, §12.22]

20. **Markdown half-done is `- [~]` on export**; import also accepts `[/]` and
    `[-]`, which other apps use. [closed §12.23]

21. **There is no SYNC · SHARE row.** The status mark in the sheet's corner is
    the whole control: it reports what has not been sent, and opens the panel
    that sends it. A button that only opens a panel the mark already opens is
    a second name for the same thing.

    Three consequences. Sharing moved into that panel, next to the code it is
    about. The opening scroll is gone — it existed to put those two buttons out
    of sight above the fold, and with nothing above the sheet the page simply
    opens on the list. And the sheet no longer needs `min-height: 100dvh` to
    guarantee something to scroll.

22. **One invitation, carrying the link and the code together.** Either half
    alone is useless: the link without the code opens an empty sheet, the code
    without the link is a string nobody can place. SHARE and COPY hand over the
    same payload.

    It all travels in `navigator.share`'s `text`, with no `url` field —
    splitting it lets a share target keep one and drop the other. The link
    itself stays bare, so §12.18's rule holds where it matters: the code is
    never a query parameter or a fragment, and never reaches history, a link
    preview, or whatever service renders the message.

23. **Task text is set in caps too**, not only the labels and titles. §6 had
    tasks staying as typed; on the sheet they read better matching everything
    else.

    The rule that matters is unchanged and now has a test: the uppercase is CSS
    only. What is stored, what the markdown export carries, and what a screen
    reader announces all keep the casing that was typed — the last of those
    needs an explicit `aria-label`, because Chrome folds `text-transform` into
    the accessible name and would otherwise shout.

24. **Every underline is drawn.** The rule under a group title, the one under
    the new-group `…`, and the one under the join field are all `handLine`
    paths rather than `text-decoration`. A CSS underline is a straight line in
    a sheet where nothing else is.

25. **One typeface, not two.** §6 had Patrick Hand for body and Caveat for
    display. The sheet is one hand's writing, so it is set in one hand: titles,
    code, tasks and labels all use `--hand`, and separate by size and caps
    instead. Caveat and its `@fontsource` package are gone.

    That leaves exactly one `@font-face` in `src/app.css` and one variable that
    names it, which is also what makes the face swappable cheaply.
    `e2e/design.e2e.ts` asserts `document.fonts` holds one family and that every
    computed `font-family` under `body` resolves to it, so a second face cannot
    creep back in unnoticed.

26. **The face is Graphe**, drawn by the owner, replacing the placeholder the
    single-face change was built against. It is not open-licensed, so the README
    says plainly that a fork must substitute its own.

    Three things followed from the file itself, none of them cosmetic.

    **The scale is corrected in the `@font-face`, not across the stylesheet.**
    Graphe is drawn on a much larger body — caps at 1.105em against the previous
    face's 0.661em, and glyphs 56% wider — so dropped in raw it overflows a
    320px screen. `size-adjust: 68%` puts that correction in one place, on the
    face it belongs to; rewriting every `--size-*` would have scattered it and
    left rem values that no longer mean anything. `ascent-override` and
    `descent-override` do the same for the 1.80em line box, which would
    otherwise space the sheet past what the drawn rules and 44px targets assume.

    68% rather than the 60% that matches cap height exactly: Graphe's x-height
    is small relative to its caps (0.57, against 0.71), a property of the face
    that no scaling changes. The app is nearly all caps, but the modals are
    sentence case, and 68% is where both read — caps slightly larger than
    before, prose legible.

    **Three printable ASCII glyphs are missing — `[`, `]`, `\`** — and they are
    allowed to fall back rather than be designed around. Rewriting the markdown
    tokens to characters Graphe has would have kept one face at the price of an
    export other apps can no longer read, which is the wrong trade. The exposure
    is smaller than it first looks: the IMPORT box flips to a summary as soon as
    the paste parses, so in practice this is only a task titled `[urgent]`.

    **`fsType` was 4** (Preview & Print embedding). Set to 0, Installable, which
    is what a self-hosted webfont should carry. Browsers ignore the field, but
    it is the file's own machine-readable statement of intent.

## Corrections to the build plan

Each of these is a deviation, recorded so it reads as deliberate rather than as
drift.

27. **The browser never talks to the blob host.** §5 says so; §3, §9 and §11
    still described reads coming straight from the CDN. §5 is right — it is what
    makes `connect-src 'self'` possible — so `PUBLIC_BLOB_BASE` and the
    `/api/room/[roomId]/version` route are both gone.

28. **Stamps come from a per-device monotonic clock**, `t = max(now, last + 1)`,
    persisted beside the client id. Without it, two edits from one device in the
    same millisecond collide on `(t, c)` and merge stops being commutative. The
    comparator also falls back to the value itself, which makes it total for any
    document, including a corrupt one.

29. **`merge` takes no clock.** Skew clamping (`clampStamps(doc, now)`) and
    tombstone collection (`gc(doc, now)`) are separate functions applied by the
    sync and write paths. Folding either into merge would destroy the algebra
    the property tests check.

30. **Every write is read back once.** Blob storage has no compare-and-set, so
    two writers can both pass the version check and the second one's bytes win.
    The loser cannot tell from the version number — it was told 2, the server
    holds 2, and its next conditional read returns 304 forever. The
    unconditional read-back is the only thing that catches it.
    `tests/sync.spec.ts` sets the race up deliberately; removing the read-back
    makes it fail.

31. **The ETag is the document's own version**, not the blob's upload time and
    size. The latter answers a conditional read without fetching the body, but
    two writes in the same millisecond whose JSON is the same length produce an
    identical token, and the second is reported as unchanged. A saved fetch is
    not worth a lost edit.

32. **The crypto envelope carries a version byte**: `base64(0x01 ‖ iv ‖
ciphertext)`, with the plaintext always deflate-raw. §3 called compression
    optional, but it cannot be past the first write — a reader cannot tell a
    compressed payload from an uncompressed one.

33. **`style-src` carries one pinned hash under `'unsafe-hashes'`.**
    SvelteKit's own `#svelte-announcer` has a hardcoded `style` attribute we do
    not author and cannot switch off. `'unsafe-hashes'` permits that exact
    string and nothing else; it is not `'unsafe-inline'`. `trusted-types` names
    two framework policies, `svelte-trusted-html` and `sveltekit-trusted-url`.
    `e2e/csp.e2e.ts` fails on any console error, so an upgrade that changes the
    string breaks CI rather than the policy.

34. **"Loose ends" has an id no document can hold**, and that is deliberate.
    `__loose__` fails the `/^[A-Za-z0-9]{1,24}$/` the validator enforces, which
    is what stops it ever being written to a document and then syncing to
    someone who has no such group. The cost is that anything which can name a
    group — a drag, a keyboard move — has to refuse it, and `moveTask` does, in
    the data layer rather than only in the UI. Do not widen the id pattern to
    accommodate it: a task pointed at `__loose__` makes the whole document fail
    validation, and the next load then discards the entire list.

## Known limits

- **Lose the code, lose the list.** No account, no email, no recovery. EXPORT
  is the only backup.
- **A shared code cannot be taken back.** Anyone holding it has full read and
  write access, and DELETE only clears your own device.
- **An unsynced edit reaches nobody** and is lost with the device.
- **A list nobody edits for six months is deleted.**
- **End-to-end encryption protects the data at rest**, not against the origin
  serving the JavaScript.
- **Hobby is non-commercial.** The moment this has a paid tier or ads it moves
  to Pro.

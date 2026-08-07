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

27. **Greek text declares its language, so capitals lose the tonos.** Greek
    drops the accent in capitals — ΚΑΦΕΣ, not ΚΑΦΈΣ — and a browser applies that
    rule only when told the text is Greek. `src/lib/doc/lang.ts` marks any text
    containing a Greek letter `lang="el"`, on the task rows, the group titles
    and the inputs behind them.

    This is a correctness fix, not a nicety. Left as English, Chrome renders
    μαΐστρος as ΜΑΪ́ΣΤΡΟΣ — dialytika plus a stranded combining acute.

    Transforming the text ourselves was never an option: decision 7 puts the
    uppercase in CSS precisely so that what is stored, exported and announced
    keeps the casing typed. Declaring the language is what lets that rule and
    correct Greek hold at once.

    One Greek letter marks the whole string, rather than a proportion of them.
    The casing rule only touches Greek letters, so "Bread ψωμί" as Greek fixes
    the Greek word and leaves the English one alone, where a majority test
    would leave it visibly miscased. The cost is that "Calculate π area" is
    Greek to a screen reader. Nothing is miscased either way, so the milder
    failure wins.

28. **The rule under a title is as wide as the title.** It was 45% of the row,
    which is a column rule rather than an underline; a pen underlines the word.
    `TextRule.svelte` sets the text a second time, hidden and out of flow, and
    draws to that width — CSS cannot ask for the width of a sibling's text, and
    the title has to keep filling its row because that row is the hit area for
    collapsing. The hidden copy carries the same caps and the same `lang`, since
    ΚΑΦΕΣ is not the width of ΚΑΦΈΣ.

    The new-group `…` gets the same treatment rather than keeping the old
    width, so the placeholder still reads as the same thing one step earlier —
    a short stub under three dots that grows as a title is typed.

29. **The app is named `/consumma`**, in the manifest, the tab title and the
    iOS home-screen name. Nowhere on the sheet: §12.14's no-chrome rule is
    unchanged, and the name is still absent from the page itself.

    The credit in the footer is the one exception to "the only words on the
    sheet are the ones someone wrote", and it sits below the torn edge rather
    than on the paper. The version comes from package.json through a Vite
    `define`, so a release cannot leave the sheet claiming an old one, and
    `e2e/design.e2e.ts` reads the same file to keep that binding honest. The
    dedication is set in italics, which with a single face means the browser's
    synthetic oblique.

    The break above it is three asterisks, and is the one separator in the app
    that is not a drawn path. Decision 24 is about rules — a line standing in
    for a border — and this is not one: it is punctuation, set in the same hand
    as the words around it.

30. **Everything that is not the list moved into a side menu.** The sheet had
    grown two rows of buttons and a footer beneath it; none of that is what
    someone wrote on the paper. One button sits in the corner — three strokes
    normally, an arrow up and out when something is waiting to go — and opens a
    panel holding sync, the code and sharing, joining, IMPORT/EXPORT,
    CLEAR/DELETE and the credit.

    The arrow replaces the hollow status mark, and is a better sign for the
    same fact: not a health light to be decoded, but an outbox that is not
    empty. What is waiting, and why, is spelt out in words the moment the panel
    opens. Decision 21 stands — the one control still opens the one panel — and
    the mark's three states collapse into two, because the third was explained
    every time anyway.

    The menu closes before any panel opens over it: two focus traps at once is
    a keyboard trap. `src/lib/a11y/trap.ts` is now shared rather than written
    twice, which is how the second copy would have drifted.

31. **The sync copy names two things separately.** `src/lib/sync/status.ts` is
    pure and tested: a headline saying how much is waiting, and a second line
    saying why it still is.

    The old single sentence conflated them. "Offline." replaced the whole line,
    so the count vanished at exactly the moment someone would want it, and it
    read as a failure rather than as a condition — which under manual sync it
    never is. Errors still go through `sync.message`, in an alert, where they
    belong.

32. **Long drawn sides are subdivided.** `handPath` bends a segment once,
    however long it is, so the menu's edge came out as a single gentle bow —
    a ruled line with extra steps. `handRect` now breaks runs longer than 90px
    into shorter ones, so a tall panel wobbles along its length. Short boxes
    are untouched, deliberately: subdividing a 22px checkbox would re-cut every
    one already drawn, and `e2e/design.e2e.ts` asserts a drawn line never moves.

33. **`--cap-lift` levels drawn marks with capitals.** Graphe's capitals reach
    15px on a 17px body while the face declares an ascent of 12, so a row that
    centres the line box leaves the capitals riding high — and the sheet is set
    entirely in capitals. Checkboxes and chevrons lift by that difference.

    The value is measured in a browser rather than derived, because
    `ascent-override` resolves against the size-adjusted em and the arithmetic
    that assumes otherwise is off by exactly the amount that looks wrong.

34. **The sheet has drawn sides.** The tears close the paper top and bottom;
    without sides it read as text on a page rather than as a strip of paper.
    `handVertical` draws each one at the height it is shown at, like the tear,
    so the weight matches exactly — a path drawn once and stretched comes out
    thinner along whichever axis was compressed.

    An `svg` is a replaced element, so `top: 0; bottom: 0` does not stretch it:
    `height: auto` resolves to its intrinsic 150px and the offsets are ignored.
    The first attempt stopped a third of the way down the sheet.

35. **The route is tested through its own handlers.** `tests/sync.spec.ts`
    drives the client against a hand-written `fetch` double that reproduces
    what the route should do — the right shape for testing a client, but it
    means the route and the double could disagree while both suites stayed
    green.

    `tests/route.spec.ts` imports the real `GET` and `PUT` and checks what the
    client leans on: status codes, the ETag round trip, the state that has to
    travel with a 409, the shared 404, and `no-store` on every answer. Only the
    blob backend is faked, because it is the one part that genuinely needs a
    network.

    What that still does not cover is `src/lib/server/blobs.ts` itself — the
    `@vercel/blob` calls — and no deployment exists yet, so nothing has run
    against a real store. That is the honest remaining gap.

36. **State that loads is untracked.** `+page.svelte` calls `sheet.load()`,
    `ui.load()` and `sync.load()` from an effect. `sync.load()` parses the last
    synced snapshot into `#lastSynced`, and `refresh()` reads it straight back
    through `unsent` — so tracked, the effect read and wrote one piece of state,
    and because each load parses a fresh object it never settled. Svelte gave up
    with `effect_update_depth_exceeded` and tore the tree's reactivity down.

    The symptom was remote: a completed join left the menu open with the code
    still typed, no error, and no sign anything had happened — while the sync
    itself had worked and the status read "Everything is synced". Nothing in the
    suite completed a join, so nothing caught it. `e2e/sync.e2e.ts` does now.

    Both effects are `untrack`ed around what they call. `refresh()` also no
    longer advances the clock: a `$state` setter reads the old value to compare,
    so writing `Date.now()` from inside an effect makes that effect depend on
    the very thing it writes. The clock belongs to whatever shows the cooldown.

37. **Two browsers, one code, in a real browser.** `e2e/sync.e2e.ts` is M5's
    acceptance and the one part of sync a unit test cannot reach: the real
    client doing its own crypto with a key it derived itself, over its own
    fetch. Requests are answered by the real `RoomStore`; the blob backend is
    the only thing faked, the same boundary `tests/route.spec.ts` draws.

    Setting up a device plants the code in storage rather than typing it into
    JOIN, because JOIN forces a sync and the ten-second cooldown then dominates
    the run. The join path has its own test.

38. **An answer from our own origin is not the same as no answer.**
    `src/lib/sync/api.ts` collapsed every non-OK response into `offline`, so a
    deployment whose blob store is not connected — which answers 500 to
    everything — told people their connection was down. That sends the one
    person who can fix it to look at their wifi.

    `refused` is now its own outcome and carries the status code, because the
    code is the one thing that says which: 404 is a route that was never
    deployed, 500 is a route that cannot reach its store. `offline` still means
    exactly what it says — nothing answered.

39. **Only a missing blob means an empty list.** `vercelBlobs.get()` caught
    every error and returned null, so a store that was not connected, or a
    token that was missing or expired, answered every read with "no list here".

    That is worse than failing. A `curl` against the API looked perfectly
    healthy — 404, `no-store`, the right headers, served by a real function —
    while the deployment could not read or write a thing. The only symptom was
    writes failing, which the client then reported as being offline. Two
    separate disguises over one misconfiguration.

    `BlobNotFoundError` is now the only failure treated as absence; everything
    else is rethrown and surfaces as a 500 the message names. `tests/blobs.spec.ts`
    is the first test this file has had, which is not a coincidence.

40. **Blobs are private, and read with `get()`.** The store was written with
    `access: 'public'` and read by fetching the public download URL — which a
    store set to private refuses outright, opaquely: the PUT is a 500 while
    reads answer an ordinary-looking 404.

    Private is what the README always asked for and what the design wants. The
    bytes are ciphertext either way, but the blob path is derived from the room
    id, so public access left that ciphertext one request from anyone holding
    one. `get(pathname, { access: 'private', useCache: false })` also replaces
    `head()` plus a fetch, halving the blob operations per read and returning
    null for a missing blob instead of throwing.

41. **Two buttons in the corner, not one that changes shape.** The burger
    reported sync state by becoming an arrow, which was two jobs on one
    control. The burger is now only a burger; a separate button sits to its
    left and appears only when there is a reason.

    An arrow up and out when edits are waiting. A circular arrow when nothing
    is waiting but it has been ten minutes — nothing syncs on its own, so a
    list left open all morning is exactly as old as when it was opened. The
    button appearing is the whole nudge: no banner, and nothing syncs until it
    is tapped. `page.clock` is what makes the ten minutes testable.

42. **The triangle collapses the group.** Tapping the title still does too, but
    the title is also where renaming starts, so the one thing on the row that
    does nothing else had to be tappable. It carries `aria-expanded`.

43. **A done task shows its own ✕.** It used to appear on hover or focus, which
    is nothing at all on a phone. Ticking something is usually the last thing
    you do to it, so the way out is there the moment it is done. Deleting is
    still local, immediate and undoable from the toast.

44. **The join field is twelve places, one rule each.** One dashed rule said
    "a string goes here"; twelve short ones say how long it is and how far
    along you are, which is what someone reading a code aloud is asking. Same
    face and size as the code above it, so the two can be compared.

    The input sits over the cells, transparent, holding the value and the
    keyboard — hiding it would take the field off the accessibility tree. Its
    caret is hidden too: it cannot line up with the places, and a caret in the
    wrong place reads worse than none. The solid rule moving along says where
    the next character lands.

45. **A failure reaches whoever caused it.** The corner sync button called
    `sync.sync()` and ignored the result, so tapping it against an unreachable
    server did nothing at all — the message existed, but only the menu rendered
    it, and the menu was not open. It says so in a toast now.

    That button is the way to sync without opening anything, which made it the
    way to be told nothing had happened. Same shape as the two storage bugs
    before it: a thing that fails and looks idle.

46. **A success is as worth saying as a failure.** The corner button toasted
    only when a sync failed, which left the run where everything worked
    indistinguishable from a dead button. It says "Synced." now. Both halves,
    or neither is trustworthy.

47. **Being unreachable is earned, and it sticks.** `refresh()` set `offline`
    from `navigator.onLine` and otherwise reset to `pending`. But `onLine` says
    the device has a network, not that the list is at the end of it — a dead
    deployment on good wifi is online by that measure. So the mark a failed
    attempt earned was thrown away by the next edit.

    `#unreachable` is set by an attempt that could not reach the list and
    cleared only by one that did. Reaching it is the only thing that proves it
    can be reached.

48. **The crossed circle outranks the arrow.** Three glyphs on one corner
    button: an outbox arrow when edits are waiting, a circular arrow when
    nothing is waiting but the list has not been looked at in ten minutes, and
    a closed ring struck through when it could not be reached. Offline wins,
    because there is no point offering to send when nothing can leave. It stays
    tappable — a condition, not a locked door.

    The ring is closed where `handRefresh` is open, so at 22px the two can
    never be confused.

    The 15-second tick in `SyncButton` recomputes the mark alongside the clock.
    That is not a poll and not a reconnect trigger: nothing there syncs, and
    decision 40 stands unchanged.

49. **The collapse control carries the count.** A drawn chevron, plus a
    `[ … 3 ]` line printed underneath it, said one thing twice. The control now
    reads `[3]` closed and `[…]` open — what is hidden and how much, in the one
    place someone is already looking. The line below is gone.

    The brackets fall back, as they do everywhere; the digit is Graphe's own.

50. **The menu's buttons are boxed, each in its own hand.** They were
    underlined and separated by middle dots, which is a link and a list of
    links — they are neither. Every one gets a drawn box seeded from its own
    name, so no two are the same rectangle; eleven copies of one shape would
    read as a stamp, which is the thing this app never does.

    A CSS border was not available: it is a ruled straight line, and nothing
    drawn here is ruled. The whole-document underline check in
    `e2e/design.e2e.ts` is what keeps this from creeping back — it used to scan
    the sheet only, which is how the menu kept eleven of them.

51. **The panel is set to be read.** Its prose and its credit were at body and
    small against a face already scaled down by `size-adjust`. Both are at
    `--size-title` now, the same size as the section headers, which are
    themselves group titles: same face, same caps, same drawn rule underneath.
    The panel is where someone goes to find out what is happening, so it is set
    at the size of something meant to be read rather than referred to.

52. **The ghost checkbox opens its row.** An empty box in a 44px target, beside
    a row that opens on a tap, that did nothing. It is a button now — out of the
    tab order and out of the accessibility tree, because the ellipsis beside it
    is the same action with a real label and two stops for one thing is worse
    than none.

## Corrections to the build plan

Each of these is a deviation, recorded so it reads as deliberate rather than as
drift.

53. **The browser never talks to the blob host.** §5 says so; §3, §9 and §11
    still described reads coming straight from the CDN. §5 is right — it is what
    makes `connect-src 'self'` possible — so `PUBLIC_BLOB_BASE` and the
    `/api/room/[roomId]/version` route are both gone.

54. **Stamps come from a per-device monotonic clock**, `t = max(now, last + 1)`,
    persisted beside the client id. Without it, two edits from one device in the
    same millisecond collide on `(t, c)` and merge stops being commutative. The
    comparator also falls back to the value itself, which makes it total for any
    document, including a corrupt one.

55. **`merge` takes no clock.** Skew clamping (`clampStamps(doc, now)`) and
    tombstone collection (`gc(doc, now)`) are separate functions applied by the
    sync and write paths. Folding either into merge would destroy the algebra
    the property tests check.

56. **Every write is read back once.** Blob storage has no compare-and-set, so
    two writers can both pass the version check and the second one's bytes win.
    The loser cannot tell from the version number — it was told 2, the server
    holds 2, and its next conditional read returns 304 forever. The
    unconditional read-back is the only thing that catches it.
    `tests/sync.spec.ts` sets the race up deliberately; removing the read-back
    makes it fail.

57. **The ETag is the document's own version**, not the blob's upload time and
    size. The latter answers a conditional read without fetching the body, but
    two writes in the same millisecond whose JSON is the same length produce an
    identical token, and the second is reported as unchanged. A saved fetch is
    not worth a lost edit.

58. **The crypto envelope carries a version byte**: `base64(0x01 ‖ iv ‖
ciphertext)`, with the plaintext always deflate-raw. §3 called compression
    optional, but it cannot be past the first write — a reader cannot tell a
    compressed payload from an uncompressed one.

59. **`style-src` carries one pinned hash under `'unsafe-hashes'`.**
    SvelteKit's own `#svelte-announcer` has a hardcoded `style` attribute we do
    not author and cannot switch off. `'unsafe-hashes'` permits that exact
    string and nothing else; it is not `'unsafe-inline'`. `trusted-types` names
    two framework policies, `svelte-trusted-html` and `sveltekit-trusted-url`.
    `e2e/csp.e2e.ts` fails on any console error, so an upgrade that changes the
    string breaks CI rather than the policy.

60. **"Loose ends" has an id no document can hold**, and that is deliberate.
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

# Decisions

What was settled, and why. Build to these; don't relitigate them.

Numbers in brackets are the section of the build plan a decision came from.

## Settled before the build

1. **DELETE removes the list from this device only.** No server call, no
   revocation. The confirm shows the code first, because that screen is the
   last place on the device it exists. [§12.1]
2. **Clearing sweeps `done` tasks and only those.** Half-done stays. It had a
   confirm _and_ a ten-second undo while it lived in the menu; it lives beside
   the group now and keeps the undo alone — see §88. [§12.2, §12.16]
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
    alone is useless to someone who has neither: the link without the code
    opens an empty sheet, the code without the link is a string nobody can
    place. SHARE hands over both.

    COPY does not. It sits directly under the code, and what a button under a
    code copies is the code — into a message already being written, or into the
    other phone's JOIN field. Handing over the whole invitation is what SHARE
    is for, and the two buttons are next to each other.

    It all travels in `navigator.share`'s `text`, with no `url` field —
    splitting it lets a share target keep one and drop the other. The link
    itself stays bare, so §12.18's rule holds where it matters: the code is
    never a query parameter or a fragment, and never reaches history, a link
    preview, or whatever service renders the message.

    Two lines, and no title or sentence introducing the app. The code used to
    end a line beginning "Code: ", which meant selecting into the middle of a
    sentence to get at it; on a line of its own it is one thing to grab.
    Whoever receives this is already being told what it is by the person
    sending it.

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
    panel holding sync, the code and sharing, joining, IMPORT/EXPORT, DELETE
    and the credit. CLEAR was in that list and left it again — see §88.

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
    drawn here is ruled — which is also why the 3px corners are a `radius`
    option on `handRect` rather than a `border-radius`. The turn bends through
    the corner it cut off, because a quadratic whose control point is its own
    chord's midpoint draws a chamfer, not an arc.

    The box lifts by `--cap-lift` to sit on the word instead of under it. The
    button keeps its 44px where it is: the tap area is not what moved. The whole-document underline check in
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

53. **Arriving leaves no trace.** Opening the page used to write four keys and
    ask for persistent storage before a single tap: a client id, a clock, the
    opening group, and a freshly made code — which the menu then showed. Someone
    who looks and leaves should be indistinguishable from someone who never came.

    Nothing is written until something is written on the sheet. The opening
    group is added quietly, because it is the shape of an empty sheet rather
    than anyone's change; it is not counted as unsent either, which had the app
    announcing "1 change is waiting to go" to a visitor who had done nothing.

54. **A code comes from the first sync.** It is the address of a list on the
    server, and before a sync there is nothing there to address — handing one
    over early would send someone to an empty sheet and leave both of them
    wondering which had got it wrong. So the menu shows no code and no SHARE or
    COPY until a sync has happened, and the DELETE confirm says plainly that
    there is no code to come back with.

    It is written down before the request rather than after it. A PUT that
    lands while the confirming read fails leaves a list on the server, and
    forgetting the code it is filed under would strand it there — the next sync
    would make a second one, and so on.

    DELETE returns the device to exactly this state: no code, and no trace.

55. **Staleness needs somewhere to have been.** `lastSyncAt` starts at zero and
    is not persisted, so a device that has never synced has been not-syncing
    since the epoch and reads as stale the moment it loads. That is right for a
    returning list — it may well be old — and wrong for a sheet with nothing on
    it and nowhere to fetch from. The corner button is hidden outright while
    there is neither a written sheet nor a code.

56. **The group header is three controls, not one overloaded one.** The title
    used to collapse on a tap and rename on a double tap, so every rename began
    by collapsing the group and every collapse was one slip from an edit box.
    The title renames. The icon collapses. Neither does the other.

57. **A group goes only when nothing in it is left to do.** Removing one takes
    its tasks with it, so it is offered in the icon's place while the name is
    being edited, and it is disabled — drawn `--faint` — until every task in the
    group is done. An empty group counts as finished: there is nothing to lose.

58. **A task offers its ✕ only when it is done.** It used to appear on focus or
    hover too, which put a live delete button beside every row a finger passed
    over and left it sitting there after an un-tick, because the pointer had not
    moved away. The cost is that removing an unfinished task now means ticking
    it first; that is the right order for a sheet where the mark beside the
    group sweeps what is done.

59. **The click after a drop is swallowed.** A release still fires a click on
    whatever was held, and everything draggable here is a button — so dropping a
    task opened its editor. It was true before groups could be dragged; adding
    the group drag is what made it visible. `pressDrag` arms a capturing click
    handler on release and disarms it 400ms later, in case a touch produces no
    click at all.

60. **Enter means "and the next one".** On a task it commits and opens a fresh
    row directly beneath; on a group title it commits the name and opens one at
    the top of the group. A list is written by typing, and reaching for the add
    row at the bottom after every line is not typing.

    Both commit inside the keydown rather than letting blur do it. Blur fires
    after the new row has been asked for and would close it again.

61. **A double tap sets half.** The first tap's toggle has already happened by
    then and is simply overridden. The alternative is holding every single tap
    back for a third of a second to see whether a second is coming, which puts
    a delay between a finger and every tick on the sheet.

    The cost is that a quick tick-then-untick lands on half instead of to-do.
    The long press still sets half too; this is a second way to the same place,
    not a replacement.

62. **On the sheet, animation is opacity and scale.** A few drawn strokes
    thrown out from a checkbox when it is ticked, and a short swell as a done
    task leaves. No colour, no shadow, nothing that moves a row while it plays.

    Both ask `prefers-reduced-motion` in JavaScript rather than hiding in CSS.
    The sparkle is cleared by its own `animationend`, so one that is merely
    invisible never clears and its strokes stay in the document for good.

    This used to say "two animations", full stop, and the menu's turn (§82) is
    the third. The rule it was reaching for is narrower than the count it kept:
    a **mark** may not turn, because a drawn stroke that rotates stops meaning
    what it was drawn to mean. The **paper** may, because it has two sides.

63. **Everything folds shut while a group is carried.** The whole list becomes a
    handful of titles, so there is somewhere visible to put it down. Nothing is
    written: the fold is a view of the drag, not a change to what is collapsed,
    and collapsed state is local and stays that way.

64. **A bare line is a task.** Most lists people already have are lines of words
    in a note, and asking them to put a dash in front of each one is asking them
    to do the import by hand first. Bullets, markers, headings and fenced code
    all still mean what they meant; a line that is none of those is a to-do.

    The cost is that pasting prose makes tasks out of sentences. That is what
    the preview is for.

65. **Two things are refused outright, and named.** Something that parses as
    JSON is a data file; something that opens with a tag, or is riddled with
    them, is a web page. Read line by line either would arrive as a heap of
    tasks made of punctuation, and undoing that is one tap per line.

    A checklist may open with `[ ]`, which is a bracket and not JSON, and a
    sentence may contain one stray `<`. Neither is turned away.

66. **The import shows what it will do before it does it.** The parsed list,
    read back in the notation it would be exported in — not the text that was
    pasted. Once a line without a bullet becomes a task, the paste and the
    result are different documents, and only the second one is the answer to
    "what will this do".

    Written as text, never as markup. Nothing in this app renders HTML.

67. **Haptics are three lengths and live in one file.** A tap for something
    done, dot-dot for something taken away, dot-dot-dash for something
    finished — the last on the same beat the sparkle is drawn on.

    Nothing longer, and nothing with a rhythm: a pattern elaborate enough to be
    read as a message is a notification, and this app does not send those.
    `navigator.vibrate` is absent on desktop and refused by iOS Safari, and both
    are fine — it is the confirmation, never the message.

68. **Every pair of actions is boxed and centred**, wherever it appears — the
    menu, the two confirms, and the import. `.boxed` in app.css is the one
    definition. The middle dot is gone from all of them.

    In the import the buttons come before the preview. The decision is what the
    panel is for; the preview is evidence, and evidence can be as long as the
    list.

69. **The refresh glyph is an open loop with a real arrowhead.** It closed to
    within twenty-seven degrees and carried a barb built from fixed offsets
    that had nothing to do with the direction the stroke was travelling, so at
    22px it read as a ring with a nick in it and a tick inside.

    A quarter of the circle is open now, which is what says "came round" rather
    than "closed", and the head is two strokes off the tangent at the end of the
    stroke — computed from the direction of travel rather than from fixed
    offsets, which is what was wrong with it.

    They open wide, nearly across the end of the stroke. A tight arrowhead is
    what an arrow has room for at a size you can see; at 22px the barbs close up
    against the ring and it reads as a blob, where a flat one stays two strokes
    and a corner.

    The pen starts bottom right and finishes top right: ending at the far right
    instead put a barb outside the box, which the bounds test caught.

## Corrections to the build plan

Each of these is a deviation, recorded so it reads as deliberate rather than as
drift.

70. **The browser never talks to the blob host.** §5 says so; §3, §9 and §11
    still described reads coming straight from the CDN. §5 is right — it is what
    makes `connect-src 'self'` possible — so `PUBLIC_BLOB_BASE` and the
    `/api/room/[roomId]/version` route are both gone.

71. **Stamps come from a per-device monotonic clock**, `t = max(now, last + 1)`,
    persisted beside the client id. Without it, two edits from one device in the
    same millisecond collide on `(t, c)` and merge stops being commutative. The
    comparator also falls back to the value itself, which makes it total for any
    document, including a corrupt one.

72. **`merge` takes no clock.** Skew clamping (`clampStamps(doc, now)`) and
    tombstone collection (`gc(doc, now)`) are separate functions applied by the
    sync and write paths. Folding either into merge would destroy the algebra
    the property tests check.

73. **Every write is read back once.** Blob storage has no compare-and-set, so
    two writers can both pass the version check and the second one's bytes win.
    The loser cannot tell from the version number — it was told 2, the server
    holds 2, and its next conditional read returns 304 forever. The
    unconditional read-back is the only thing that catches it.
    `tests/sync.spec.ts` sets the race up deliberately; removing the read-back
    makes it fail.

74. **The ETag is the document's own version**, not the blob's upload time and
    size. The latter answers a conditional read without fetching the body, but
    two writes in the same millisecond whose JSON is the same length produce an
    identical token, and the second is reported as unchanged. A saved fetch is
    not worth a lost edit.

75. **The crypto envelope carries a version byte**: `base64(0x01 ‖ iv ‖
ciphertext)`, with the plaintext always deflate-raw. §3 called compression
    optional, but it cannot be past the first write — a reader cannot tell a
    compressed payload from an uncompressed one.

76. **`style-src` carries one pinned hash under `'unsafe-hashes'`.**
    SvelteKit's own `#svelte-announcer` has a hardcoded `style` attribute we do
    not author and cannot switch off. `'unsafe-hashes'` permits that exact
    string and nothing else; it is not `'unsafe-inline'`. `trusted-types` names
    two framework policies, `svelte-trusted-html` and `sveltekit-trusted-url`.
    `e2e/csp.e2e.ts` fails on any console error, so an upgrade that changes the
    string breaks CI rather than the policy.

77. **"Loose ends" has an id no document can hold**, and that is deliberate.
    `__loose__` fails the `/^[A-Za-z0-9]{1,24}$/` the validator enforces, which
    is what stops it ever being written to a document and then syncing to
    someone who has no such group. The cost is that anything which can name a
    group — a drag, a keyboard move — has to refuse it, and `moveTask` does, in
    the data layer rather than only in the UI. Do not widen the id pattern to
    accommodate it: a task pointed at `__loose__` makes the whole document fail
    validation, and the next load then discards the entire list.

78. **A price is read off the task, not stored beside it.** A shopping list
    already carries its numbers — `2x Tomatos 5,08` — and what it could not do
    was say what the trolley comes to. That could have been two new fields on a
    task, and it is not: a task is one string, and adding a `cost` to the
    document would mean a schema version, a merge rule for it, a stamp for it,
    and an export that no longer round-trips through another app. `amount.ts`
    reads the string on the way to the screen instead, the way `lang.ts` does,
    and `aria-label`, the markdown export and merge never see the difference.

    **Both `,` and `.` are decimal separators, and thousands are still
    readable.** Picking one mark and calling the other a grouping separator
    would have been simpler and wrong in half of Europe; picking by locale would
    make one person's list read differently on the other person's phone, which
    is the one thing a shared list cannot do. So the digit pattern decides: one
    or two digits behind the final mark makes it a decimal point, exactly three
    makes it a grouping mark, four is neither and the line has no price in it.
    `5,08` and `5.08` are the same money, `1,234` and `1.234` are the same
    thousand, and `1.234,56` and `1,234.56` both come to the same. Values are
    held in integer minor units, because ten prices at `0,10` have to come to
    `1,00` and floats do not.

    **A row counts as count × price, and the row still shows the price.** Three
    potatoes at 20,00 is 60,00 in the total, and the row goes on saying what one
    costs — because that is what gets checked against a shelf edge. Showing the
    line total on the row instead would mean the sheet displaying a number
    nobody typed, next to a checkbox. The total is the one place a derived
    number belongs, so it is the only place one appears.

    **A group writes its numbers one way, and it is not always the way they
    were typed.** Two people adding to one list write `5,08`, `20.00` and `10`
    down the same column, and a column of prices that cannot be read down is
    not a column. So the prevailing form wins — the separator most of them
    used, two decimals if any of them wrote any, and a currency mark when every
    price that wrote one wrote the same one — and every price in the group is
    written out in it, including the ones that wrote no mark at all. A count
    always ends in one `×` and is never padded with decimals; it counts things.

    The style is taken from every priced row, done ones included, so ticking
    the only price with decimals does not rewrite the column above it.

    **Only the prices are a column.** The counts were given one too at first —
    a reserved slot on every row of a group, empty where a row had no count, so
    the names started level. It lines four numbers up at the cost of indenting
    every row that has none, which on an ordinary list is most of them. A count
    reads as the word it stands in for and belongs in front of the words; the
    prices are what a column is for, because reading down them is the point.

    This is a change of position and worth saying so: the row used to show the
    price exactly as typed. What is inviolate is the text, not the rendering —
    `aria-label`, the markdown export and merge still see every character that
    was typed, which is where the promise actually lives.

    **Done does not count; half counts in full.** The total is what is still to
    buy, so a ticked task is already in the basket — and it takes its count with
    it, so four loaves ticked removes four loaves, not one. Half is not half the
    money: it is a task still on the list, and the tri-state was never a
    progress bar.

    **The total sits on the group header**, between the title and the `[…]`,
    because a group is what a total belongs to and the header is the one row
    that is not a task. It stays while the group is collapsed, which is when a
    number standing in for four hidden rows is worth the most.

    **The figures are set in a system monospace**, and that is the single
    exception to one typeface. A price is a figure rather than a word: it has to
    line down a column, and tabular digits in the hand would still not read as a
    different kind of thing from the words beside them. A system stack rather
    than a second `@font-face` keeps the exception cheap — no file, no request,
    nothing added to `connect-src`. `e2e/design.e2e.ts` names it by class
    instead of loosening the rule, so anything else leaving Graphe still fails.

    `--mono-scale` corrects for the mono being drawn on a larger body than
    Graphe, in one place and for the same reason `size-adjust` and `--cap-lift`
    exist. It is measured in a browser, not derived. Inside a row the words take
    `overflow-wrap: break-word` rather than the `anywhere` a plain row uses:
    both break the same words, but `anywhere` also shrinks the element's
    min-content width to a single character, and a flex item sized from that
    gives the words a column two letters wide while the price sits in daylight.

    **`--num-lift` is the other half of `--cap-lift`.** Two faces sharing a
    baseline is not the same as two faces looking level: Graphe's capitals are
    drawn riding high above their own baseline — a canvas puts their ink a pixel
    clear of it at 19px — so a mono digit sitting honestly on that baseline
    hangs low beside them. Measured, like its twin, and applied with `position:
relative` rather than a transform, which does not apply to an inline box.

    The figures carry no weight of their own. A face of its own is difference
    enough, and synthesised bold on a system mono beside a hand is two kinds of
    emphasis for one distinction.

79. **Every ✕ stands in one column, out in the margin.** There are two ways to
    delete something on the sheet — the one a done task offers, and the one a
    group offers while its name is being edited — and they used to sit in
    different places, each taking its width out of the row it was on. On a task
    that meant the price column stopped being a column the moment anything was
    ticked, which is most of what a shopping list does.

    Both now sit in `--gutter`, absolutely positioned out of the flow, so a ✕
    appearing moves nothing. The box starts at the row's own edge, so it never
    covers the price beside it and tapping a price still opens the row, and it
    stops half a rem short of the viewport, so it cannot push the sheet
    sideways at 320px. It overlaps the drawn paper edge, which was accepted:
    the alternative was a permanent 44px indent on every list, numbers or not.

    It is narrower than `--touch` across and keeps the full 44px of height.
    That is the price of the position, and the only place in the app that pays
    it.

    A consequence worth naming: **the group's collapse icon stays put while the
    name is being edited.** It used to give up its square to the delete; with
    the delete in the gutter there is nothing to give up. The icon also moved up
    beside the title, so the total is the last thing on the header row and
    stands directly over the prices it is the sum of.

80. **The caret goes with the tap, and Escape had to be taught to discard.**

    Tapping a task swapped its text for an edit field that was never focused.
    Nothing could be typed into it, and — because an unfocused field never blurs
    — the row never committed and never came out of edit mode. On a task with a
    count and a price in it, that reads exactly like the two being lost, which
    is how it was found.

    Focusing it exposed the second half. `onblur={commit}` plus an Escape that
    only set `editing = false` meant Escape _committed_: taking a focused field
    out of the document blurs it. It was invisible before because there was
    never anything in the field to keep. Escape now puts the text back before it
    drops the field, on the task row and the group title alike.

81. **Backspace is the other half of Enter.** Enter leaves a task and opens a
    fresh row beneath it; backspace on a row with nothing left in it closes that
    row and carries the caret back to the end of the task above. A task that has
    been emptied of its words goes the same way, through the ordinary delete, so
    the ordinary undo catches a slip. A row with nothing above it just closes,
    and nothing is deleted — there would be nowhere for the caret to land.

    Opening another row's editor is the one thing a `TaskRow` could not do from
    outside, and it is `Sheet` that knows which row is above which. So `Sheet`
    holds the id, as it already holds where an open empty row is sitting, and
    the row clears it as soon as it has taken the caret.

82. **The menu unfurls: the sheet turns over.** The panel had been laid out from
    the paper's own variables for some time — same width, same margins, same
    room above and below the tear — expressly so that it would land on the sheet
    rather than beside it. Both files said as much in their comments. But it
    appeared instantly, so the one claim the geometry existed to support was the
    one thing nobody ever saw. Now the sheet folds edge-on and the panel opens
    back out of the same line, half of `--flip` each.

    **About the middle of the paper, not an edge.** A receipt turned over is
    held in the middle and spun; hinged at a side it is a door, or a page in a
    book, which is a different object. The middle is also the only axis that
    does not favour a hand — the sheet narrows to the same line from both sides
    at once. It was built hinged on the right edge first, on the reasoning that
    the burger is there and the ✕ that replaces it is drawn at the same point,
    so the two would barely move while the paper turned around them. That is a
    real property and it is not worth the object it makes.

    **Two elements, not one turning through 180°.** The sheet is in flow and
    scrolls with the list; the panel is fixed to the viewport with its own
    scroller. Putting both in one `preserve-3d` box means laying the page out
    around the animation, and the page is the thing the animation is about.

    **Every half-turn is the same movement, and the paper only ever spins one
    way.** A hand pushing the paper rightwards sends the side under it back and
    brings the far side forward, the way a revolving door goes — so the face on
    its way out leads with its **left** edge and goes to edge-on (`0 → 90°`),
    and the face arriving settles out of its right (`-90° → 0`). Opening and
    closing are identical, because the paper does not know which side it is on —
    so a swipe rightwards always spins it the same way, and swiping again
    carries the rotation on rather than winding it back. A receipt spun in the
    hand keeps going round; it does not return along the arc it came by.

    It turned the other way for a while, which read as pulling the paper rather
    than pushing it: the side under the finger came towards the reader while the
    finger went the same way, which is not what a hand does to a sheet.

    That means a sign flip at each join: `.turning` leaves the sheet at `90°`
    and `turn-back` picks it up at `-90°`, a quarter further round rather than a
    quarter back down. Nothing is seen of it — both are edge-on, the sheet has
    no width at either, and the panel is over it at full width at that moment
    anyway. The near edge changes sides at the same join, because the panel's
    words are set to be read rather than mirrored, and that is invisible for the
    same reason. Nothing turns past a quarter, so no content is ever shown from
    behind.

    Three wrong turns on the way here, kept because each one's reasoning looked
    sound and was answering a question nobody had asked.

    The first folded the paper to edge-on and opened it back out along the arc
    it came in by, keeping one edge near throughout. Continuous to look at, but
    it is a sheet being folded shut and reopened rather than one being turned
    over.

    The second was the argument for it: on the right-edge hinge, the version
    that mirrors magnified its near edge to 411px on a 390px screen and cut off
    its own drawn frame. Real, and an artefact of hinging at an edge — about the
    middle the near half's magnification is paid for by the far half, and
    measured at 320, 390, 768 and 1280 no version leaves the paper. The
    measurement outlived the condition it was taken under.

    The third had the two halves mirroring each other, which is a true 180°
    flip and does turn the receipt over — but it reverses on the way back, so a
    second swipe the same way unwinds the first. Correct for a page in a book,
    where there is a spine to reverse about. There is no spine here.

    `transform-origin: 50% var(--eye)`. The Y half is not the axis — a `rotateY`
    is the same rotation wherever the origin sits vertically — it is the
    vanishing point, which `perspective()` takes from the transform-origin too.
    Left at the middle of the element, a sheet as tall as its list turns away
    towards a point a screen or more below the reader. `+page.svelte` writes the
    viewport's middle there at the tap, one rect read.

    The panel is in the document from the instant of the tap, with its trap
    armed and its focus taken; only the drawing waits, held edge-on by an
    animation delay. So nothing is held back for a keyboard or a screen reader.
    That delay is also why `prefers-reduced-motion` is asked in JavaScript here
    as everywhere else: the backstop in `app.css` shortens durations and says
    nothing about delays, and a panel left to it alone would hang edge-on and
    unreadable for exactly as long as the animation it was not playing.

    The drag that dismisses the panel turns it back now, instead of sliding it
    sideways. It used to translate along X and snap home, under a comment
    reading "Springs back", which nothing transitioned and which therefore did
    not. Sliding was also the wrong gesture for a panel that is the back of the
    sheet: there is nowhere beside the paper for it to go.

83. **The edge coming forward is drawn heavier as it comes.** A sheet turning about
    its middle brings one side towards the reader and sends the other away, and
    the transform says almost nothing about which. Worse than nothing: a vertical
    stroke's width is measured across the paper, so the rotation that ought to
    thicken the near edge compresses it instead, and both sides come out thinner
    than they started. Measured at 45°, a near edge magnified by perspective to
    1.13 and compressed by 0.71 lands at 0.8 of its own weight.

    So the weight is drawn rather than derived. `near-out`, `near-in` and
    `near-home` in app.css take the near edge to `--near-peak` times its own
    weight at the point it is nearest, and the far edge is not touched at all —
    the asymmetry is the whole signal, and thickening both would say only that
    something was happening.

    Two ways it was written and did not work, both silent. `--hand` was already
    the typeface, so naming the drag progress the same made every one of these
    declarations invalid at computed-value time and `stroke-width` fell back to
    its initial 1 — the panel's own left edge had been drawing at 1px rather
    than 1.4 at rest for the same reason. And with valid values it still
    stepped: `--stroke` is unitless, so `calc(var(--stroke) * 2)` stays a
    `calc()`, and two unresolved calcs do not interpolate. Multiplying through
    by `1px` resolves them. The timing is `linear` rather than eased, because
    the weight is a reading of how near the edge is and not of how far through
    the animation it is; easing both put nearly all of it into the last few
    degrees, where the paper is edge-on and there is nothing to see.

    **What `--near-peak` names is what reaches the screen, not what is drawn.**
    Three times the weight, drawn, arrives as rather less than three and by a
    different amount at every angle. So the wanted multiple is stated in what the
    reader sees and the geometry is divided back out: `cos` for the compression,
    and the square of the distance ratio for the perspective magnification, which
    needs half the paper's width — `--half`, measured in JavaScript because CSS
    cannot ask. Measured across a turn the on-screen weight now tracks the want
    exactly to about sixty degrees, and the drawn stroke stands at `--near-cap`
    by the quarter, where the paper is edge-on and there is nothing to see.

    It is written as a blend between one and the corrected peak, weighted by
    `--near`, rather than as the corrected want on its own. The difference is the
    far edge: with `--near` of nought the plain version still divided by the
    compression and came out at one over cosine, so the edge going _away_ from
    the reader thickened as the paper turned. Both ends of the blend are exact
    and the middle is within a fiftieth of what the geometry asks for.

    Which edge is near is not a state anything is told. It is the sign of the
    sine — `max(0, sin(--turn))` on the left, its negation on the right — which
    is why `--turn` is registered with `@property`: registered, it interpolates,
    so the transform becomes a plain rule reading the angle and everything that
    is a reading of the rotation falls out of that one number. Three keyframe
    blocks and a whole custom property went with it.

    `near-home` was separate from `near-in` and that was the point of it. A drag
    that stops short leaves the paper part-turned and its near edge part
    weighted, and springing home from the peak made the line grow heavier while
    the paper was straightening and the edge going away from the reader —
    backwards, and the wrong way round twice over.

    Which side is near is not decided in the keyframes; it is whichever side the
    selector points at, and that is the left one leaving and the right arriving,
    on both faces of the paper — the far side of a pushed sheet is the one that
    swings towards you. Under a finger the weight follows `--hand`, how
    far round the paper has been turned from nought to one, so the animation
    picks it up where the drag left it rather than starting again from flat.

    It is worth naming what this breaks: §62 says animation here is opacity and
    scale. A stroke gaining weight is neither, and it is not a colour or a shadow
    either — it is the line drawn heavier, which is what a nearer line looks like
    in a drawing. That is the same argument the turn itself won, and it is the
    last one of its kind: the mark is not moving or changing what it means, only
    being drawn with more of the pen.

84. **The far half of a turning sheet cannot be put out of focus, and it was
    tried.** A rotation gives an eye two cues about which way a surface faces,
    and the app has one of them: the near edge drawn heavier. Weight can only
    speak at an edge, and the surface between the edges says nothing. Depth of
    field is what would say it.

    It shipped for one commit and came straight back out. Two panes over the
    paper, masked to fade at the middle, blurring with `backdrop-filter` — and
    the result was a doubled ghost of the whole sheet, offset from the sheet
    itself. The cause is not tuning. `backdrop-filter` samples its backdrop at
    the backdrop root, in screen space, and the filtered image is then drawn
    through the element's own transform: inside a rotated element it is
    transformed a second time. Switching the panes off in the same paused frame
    made the ghost vanish, which is how it was pinned down rather than guessed
    at.

    A gradual blur of live content inside a 3D transform needs the content
    duplicated — one sharp copy and one blurred, masked against each other — and
    the content here is the whole list. A uniform `filter: blur()` on the paper
    would stay in register, because a filter applies before the transform rather
    than after it, but a sheet uniformly out of focus is not depth of field and
    says nothing about which half is further away.

    The other way that would work is to take the panes out of the rotation
    entirely — fixed to the viewport, over where the paper is drawn, driven by
    the same state — so the blur samples the already-rotated sheet in screen
    space. That is a real restructure, and it is written down here rather than
    half-built.

    It also settles a palette question by removing it: a blur of black on white
    is grey, and while the turn was the one place that might have earned the
    exception, nothing earns it while it is also broken.

85. **A drag rightwards turns the receipt over, from either face.** The sheet is
    dragged aside to bring the menu up, and the panel is dragged aside to put it
    back. One gesture on one object, whichever side happens to be showing —
    having it only on the panel made the turn something the paper did to you on
    the way in and something you did to it on the way out.

    `src/lib/turn.ts` holds the arithmetic both sides read: how far a drag has
    turned the paper, where it has pushed the axis, and whether letting go
    finishes the turn. Only the sign differs, because the two are halves of one
    rotation. It is a module with a test rather than a pair of near-identical
    handlers, which is the shape the second copy of anything here has always
    drifted into.

    **A sheet pushed sideways goes sideways first.** The paper slides before it
    begins to come round, and its near edge is unweighted for the whole of that,
    because a paper that is not turning has no near edge. A hand does not spin a
    receipt from the instant it touches it, and rotation that begins on the
    first pixel reads as a mechanism rather than as paper. The slide is a
    `translate` and the turn a `transform`, so the two compose without either
    having to know about the other.

    How far it may slide is not a constant: it is the room between the paper's
    own drawn edge and the screen, capped at `LEAD`. The paper never slides off.
    On a phone it is drawn almost to the edges, so the room is a few pixels and
    the slide is barely a nudge — running out of room is what starts it turning,
    which is the truer reading of the two. Measured off the side edge rather
    than off the element's box, because the box carries the paper's margin and
    it is the drawn line that must not leave the screen.

    **The two faces draw the line in different places.** On the panel the drag
    takes hold over the buttons as well. Nothing there owns a press — every
    button is a tap and nothing more — and most of the panel is buttons, so a
    gesture that only worked in the gaps between them was a gesture that mostly
    did not work. A drag that crossed a button is not a press of it, so the
    click is swallowed in the capture phase, which is what the sheet already
    does after a row is dropped. Text fields keep their own drag on both sides,
    which is selecting text.

    Both sides take `setPointerCapture` on the **first move**, not on the press.
    Capturing a pointer retargets the click that follows it to whatever holds
    the capture, so taking it on `pointerdown` stopped every button on the panel
    working — the click arrived at the panel instead of at the button under the
    finger. A press that never travels never captures, and so is still a press.

    On the sheet it takes hold on bare paper only. Everything on the sheet that
    can be pressed already owns a press — the long press that lifts a task, the
    one that lifts a group — and a receipt that turned over when someone meant
    to carry a row would be worse than one that only turns from the margins. It
    also gives the gesture up at the first sign of vertical movement, since the
    sheet is the thing that scrolls, and `touch-action: pan-y pinch-zoom` on
    `main` says the same to the browser. Pinch is spelt out because `pan-y`
    alone would take zoom away with it, and this is a sheet of words.

    Both sides take `setPointerCapture`. Turning the paper takes it out from
    under the hand — that is what turning it means — and without capture the
    events go to whatever is underneath, so the move stops being seen and the
    release is never heard, leaving the paper hung at the angle it reached.

    **The axis moves a little, and comes home first.** A sheet spun in the hand
    is not held in a vice: `--axis` drifts up to `DRIFT` percent off the middle
    with the push, and `recentre` in app.css brings it back under `--inertia`,
    which overshoots slightly and settles. It runs on a shorter clock than the
    turn — 60% of `--flip` — because an axis still wandering at the quarter
    would hand the other side of the receipt a turn about a line that is not its
    own. That means two animations on one element rather than one, since a
    single keyframe timeline can only be eased one way at a time, and it means
    both `animationend` handlers have to ignore `recentre`: it ends first, and
    the panel's handler is what unmounts the panel.

86. **The sheet is prerendered, so it may not carry a `style:` directive.**
    Svelte renders one as a literal `style="…"` attribute in the HTML that
    ships, and `style-src 'self'` refuses an inline style outright — the page
    hydrated with two console violations the moment `--turn` and `--axis` were
    bound that way. They go on through the CSSOM instead, the route `--eye`
    already took.

    The panel is free to use `style:` and still does. Nothing is open when the
    page is built, so it is never server-rendered and the attribute never
    reaches the HTML. The difference is not a rule about which directive is
    safe; it is a rule about which elements are prerendered.

    `e2e/csp.e2e.ts` caught it, which is the whole reason it watches the console
    rather than only reading the header back.

87. **The paper is torn, not drawn torn, and the teeth are what cuts.** On two
    colours the ground behind a tear is the same white as the paper in front of
    it, so nothing about a filled box is visible until something passes behind
    the teeth. In the panel something does — the writing scrolls — and it was
    cut along a straight line a tooth's height short of the teeth, which floated
    clear above it. A zigzag with a white rectangle doing its work.

    **The fill goes on the outer side.** `TornEdge` closes its zigzag along the
    top of its own box and fills that, so what is past the tear is not paper and
    anything travelling that way is cut tooth by tooth. The bottom tear is the
    same svg turned over, so its outer side is the room below. Nothing is filled
    on the inside: the paper's own ground is already there, and a second one
    painted over it is the rectangle this replaced.

    **The scroller runs the full height of the paper, tears included.** That is
    the other half, and neither half cuts anything alone. `.menu` pads by
    `--paper-top`/`--paper-bottom` and no more; the room the writing needs clear
    of the teeth is `.scroll`'s own `padding-block: var(--tear)`, held inside
    the scroll rather than outside it. A line therefore rests exactly where it
    always rested, and it is the room above it that scrolls away, carrying the
    line up behind the tear to be cut there.

    An earlier pass had the fill on the inside and the scroller stopping at the
    tear's inner edge. Both were wrong in the same direction and each hid the
    other: the inner fill was invisible against the panel's own ground, and the
    straight cut was blamed on the tear being drawn too high.

    **The sides run up into the tears and are cut back by the teeth.** They used
    to stop flush at each tear, which ends them on a clean horizontal — a sheet
    guillotined at three edges and torn at the fourth, and the one thing left
    saying the tear was a band laid on the paper rather than where the paper
    gives out. They overhang by a tear at each end now and the teeth take them
    back, which is the same cut the writing behind a tear gets.

    That only reads if both tears are painted over the sides, and the two faces
    reach it differently. The panel writes its sides before both tears and needs
    nothing more. The sheet cannot: its top tear is above the paper in the flow
    and its bottom tear below it, so whichever order the sides are written in,
    one tear is on the wrong side of them. Both are lifted instead — positioned,
    `z-index: 1` — which says it once for the pair.

    The ground closes a full tear **past** the box rather than flush at it. The
    box is `overflow: visible`, for the zigzag's own stroke, and the sides
    running up into it carry a round cap that reaches past their box too; closed
    at nought, that cap came out above the teeth as a stray tick of ink.

    **The tears stop on the two verticals rather than running past them.** The
    zigzag used to be drawn to the full width of the paper while the sides sit
    half a `--edge` in from it — that is where a side's stroke runs in its own
    box — so each tear overshot its corner by a few pixels and left a whisker of
    the paper's edge sticking out into the margin. Trimming both tears by that
    half gives the two marks one corner.

    Which puts the outer half of each vertical, and the cap on the end of it,
    outside the fill: the ground's own boundary is the line the tear starts on.
    So it carries a strip past each end — `PAD` further out, and down as far as
    the corner the zigzag made there and no further, because below the corner
    the side is the paper's own edge and has to be seen. The left corner is the
    midline, where every tear starts; the right one is wherever the last tooth
    landed, which the path is the only place that records.

    The strips are outside the tear's span and nowhere else. One rectangle
    across the whole width would be simpler and wrong: it would cut the paper
    straight along the midline wherever a tooth reached above it.

    The sides themselves are still not jagged, and that is right: paper running
    the last few pixels out to a straight drawn line is what a straight drawn
    line means. It is only their ends that the tear now owns.

88. **CLEAR left the menu for the group it sweeps.** It was a button in a panel
    with a confirm in front of it, which is a long way from the tasks it was
    about to take — and the confirm was there precisely because the tap was so
    far from them. The group's own mark does it now: the same scribble that
    removes a group, doing the other half of the same idea. While there is
    still something in the group to do it clears what is done; once there is
    not, it removes the group, which is what it always did.

    So the mark is drawn whenever it has a job and never when it has not,
    which is the rule a done task's own mark already follows — and it is no
    longer hidden behind opening the title for renaming. No confirm: the mark
    says which of the two it is, it is only ever there with something to
    sweep, and the ten-second undo covers the change of mind, exactly as it
    does for removing a group.

89. **A run of ticks offers to sweep itself.** Three tasks ticked inside five
    seconds is somebody at the end of a shop going down the list, and what
    they want next is those rows gone. The message offers it and never does
    it — a sheet that cleared itself would be the app deciding — and it is
    offered once per run rather than once per tick after the third, because
    the second kind is nagging. The offer clears exactly the tasks in the run,
    checked against what is still done when it is tapped, so a tick taken back
    in the meantime is left alone.

90. **A drop leaves a message with a way back; a keyboard move does not.** A
    move is the one change a finger makes that leaves no trace of where the
    thing came from. Where it came from is two strings read off the task before
    it goes, and putting them back is an ordinary move stamped now, not a
    rewind. Alt+↑/↓ keeps its announcement instead: it is exact, it says where
    the task went, and a run of them down a list would raise a message a step.

91. **The checkbox gave the first word back.** Its target reached a third again
    past its own mark so that a finger going for the box and landing on the
    first word still ticked the task. What that cost was the first word or two,
    which then belonged to the checkbox: tapping them ticked instead of opening
    the row, and pressing them could not lift the task at all, because the lift
    lives on the words and the box was sitting on top of them. Two of the row's
    three gestures went missing at the one end of the row a finger goes to,
    which is dearer than the mis-tap it was buying. It is `--touch` across
    again, and still the full height of the row.

92. **One scribble, drawn once.** Every delete mark was seeded from the thing
    it would remove, so a sheet of done tasks showed a different scribble on
    every row — which is the "seeded so it never re-jitters" rule applied to
    the wrong noun. The seed is the mark's own name now (`SCRIBBLE` in
    draw/hand), so the mark on a task and the mark on a group header are the
    same drawing. It is as tall as the checkbox at the other end of the row and
    narrower than it is tall, because the column it stands in is narrower than
    the checkbox and the ink must keep clear of the paper's drawn edge — and a
    scribble made in a tall box comes out an S struck through.

93. **A collapsed group says what is left, not how much is under it.** `[3]`
    answered the wrong question: a group is folded away because it is dealt
    with or because it is not yet, and a total says neither. `[1/3]` is what is
    still to do out of what is hidden, with half counting as still to do,
    because it is.

94. **A long press on the fold icon folds every group.** The icon is the fold
    control, so the bigger version of folding belongs to it — and on a long
    list it is the difference between a sheet and a scroll. It opens them all
    again when there is nothing left folded, so the gesture always has a way
    back. Nothing is written that the tap does not write: it is the same local,
    never-synced record, set for every group at once.

95. **A drop below the last task landed it first.** Below the last row there is
    no row to hit-test, only the group, and the group counted the row being
    carried among its own children — so the drop asked for a place one past the
    end of the list it was going into. Neither neighbour existed at that index,
    and a key between nothing and nothing is the first key there is. The count
    now leaves the carried row out, exactly as the row branch beside it always
    did, and `orderAt` clamps besides: a caller that is one out should be one
    out, not inverted.

    The same fault drew a landing rule where the row already was: the end of
    the group came back one higher than home, so the guard that refuses a
    no-op drop did not recognise it.

96. **The landing rule needed the shift the group's rule already had.** The hit
    test counts the rows with the carried one taken out, because that is the
    list it is going back into; the markup counts every row it draws. Below the
    row's own place the two are one apart, so the rule appeared directly under
    the row in the hand — an offer to put it back where it already was, beside
    a drop that would have done something else. `isGroupLanding` had this
    translation and its own docstring explaining why; `isLanding` now has both.

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

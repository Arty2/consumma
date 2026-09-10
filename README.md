# /consumma

A local-first, multiplayer grocery and task list, as a web app.

Two or more people connect to the same list with a short code. It's private
by design: no accounts, no tracking, no analytics, and nobody but the people
you share the code with can read what's on the list. It works with the
network off, and installs to a home screen like a native app.

Design-first and back to basics: black on white, handwritten, no chrome —
built with the kind of attention to detail and small delights of something
drawn by hand rather than assembled from a component library. The sheet is a
sheet, and the only words on it are the ones someone wrote.

- Project page: [heracl.es/consumma](https://heracl.es/consumma)
- Demo: [consumma.vercel.app](https://consumma.vercel.app)
- Source: [github.com/arty2/consumma](https://github.com/arty2/consumma)

It's deployed and working today. The deployment runbook and the rest of the
technical detail — including how the privacy actually works — live in
[TECHNICAL.md](./TECHNICAL.md), linked again at the bottom of this file.

## The name

"Consumma" comes from the Latin _consummare_, to complete — as in
_consummatum est_, "it is finished."

## Running it

```
pnpm install
pnpm dev
```

| Command          | Does                                                    |
| ---------------- | ------------------------------------------------------- |
| `pnpm check`     | `svelte-check` against the strict tsconfig              |
| `pnpm lint`      | Prettier and ESLint                                     |
| `pnpm gates`     | Project rules a linter can't enforce — see TECHNICAL.md |
| `pnpm quick`     | Gates, types and unit tests — no browser, no build      |
| `pnpm test:unit` | Vitest, including the merge property tests              |
| `pnpm test:e2e`  | Playwright against a production build on port 4173      |
| `pnpm test`      | Gates, unit tests and end-to-end tests in one go        |
| `pnpm build`     | Production build through `@sveltejs/adapter-vercel`     |

`pnpm quick` is the one to run while working: it answers in about a quarter of
a minute because it never starts a browser. `pnpm test` is what to run before
asking for a change to land. Nothing deploys from Actions.

## Contributing

Open a pull request as a draft and leave it there while you work. A draft only
runs the fast checks — gates, types, lint, unit tests — so every push gets an
answer in well under a minute. Mark it ready for review once you actually want
it merged: that's what runs the full suite, Playwright included, and it has to
pass before anything lands on `main`.

A commit that only touches `.md` files skips CI entirely, since prose can't
break a build. The exact jobs, their timings, and how to run the full suite by
hand without marking anything ready are in
[TECHNICAL.md](./TECHNICAL.md#ci).

## Using it

Nothing on the sheet is labelled, so this is the whole of what it answers to.
Most of it is one tap doing the common thing; the rest is a long press —
about half a second — or a second tap inside a third of one.

Everything below is a live record: if a gesture here disagrees with the app,
the app is right and this file is a bug.

### A task

| Where          | Gesture            | What happens                                              |
| -------------- | ------------------ | --------------------------------------------------------- |
| The checkbox   | Tap                | To-do ⇄ done                                              |
| The checkbox   | Two taps, or hold  | Half done. Holding a half-done task puts it back to to-do |
| The checkbox   | `Space` / `⇧Space` | The same two                                              |
| The words      | Tap                | Opens the row for editing, caret where you touched        |
| The words      | Two taps           | Marks it done                                             |
| The words      | Three taps         | Marks it half done                                        |
| The words      | Four taps          | Back to where it started, and open for editing again      |
| The words      | Hold, then drag    | Picks the task up, including into another group           |
| The words      | `F2`               | Opens the row for editing                                 |
| A done task    | Tap the mark       | Deletes it, with an undo                                  |
| Anywhere on it | `Alt+↑` / `Alt+↓`  | Moves it, across group boundaries at the ends             |

A run of taps that begins in the last few characters of a task never climbs
that ladder — reaching for the end of a line means adding to it, so two taps
there are two attempts at the same thing rather than a tick. A run that begins
inside an already-open field is left alone too, since that is a caret being
placed.

### While a row is open

| Gesture                     | What happens                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `Enter`                     | Cuts the task at the caret; the rest goes to a new row, caret at its head                      |
| `Enter` at the start        | The writing goes down a row and an empty one opens above it                                    |
| `Backspace` at the start    | Joins the task onto the end of the one above, caret at the seam                                |
| `Backspace` on an empty row | The row goes, caret to the end of the one above — or to the group's name, if it opened the row |
| `Escape`                    | Discards and closes                                                                            |
| Overflow                    | At 200 characters the row fills up and the rest starts the next one                            |

Nothing is ever refused mid-sentence. A word travels whole, and a paste spills
by the same rule as typing. A row that ran out of room is the one exception to
where the caret lands: it is still being typed at its end, so the caret stays
behind what came down rather than in front of it.

A row still being typed answers to all of this the same way a committed task
does — on the sheet they are the same thing, one line of writing with a box
beside it — except that it leaves without anything being deleted.

A join happens only if the two will fit in one task — a row that filled up and
spilled cannot be poured back into the row it came from, and then the key does
nothing at all. Joining takes nothing away, so there is no message and no undo:
the words are all still on the sheet, a line higher.

An open row's checkbox is drawn faintly while the row is empty, and in full ink
the moment there is something written in it.

### A group

| Where             | Gesture            | What happens                                                    |
| ----------------- | ------------------ | --------------------------------------------------------------- |
| The title         | Tap                | Folds the group                                                 |
| The title         | Two taps, `F2`     | Opens the name, leaving the group folded as it found it         |
| The title         | Hold briefly       | Opens the name too — a buzz says when to let go                 |
| The title         | Hold on            | Picks the whole group up; everything folds while it is carried  |
| A carried group   | Over the list name | Opens the lists it could go to                                  |
| A carried group   | Drop on a list     | Moves it to that list, with everything in it                    |
| A carried group   | Drop on `NEW LIST` | Makes a list on this device and puts it there                   |
| A carried group   | Drop on the fold   | Removes it, with everything in it                               |
| The `(…)` icon    | Tap                | Folds the group, for anyone who would rather aim at it          |
| The `(…)` icon    | Hold               | Folds **every** group — or opens them all, if none is left open |
| The name field    | `Enter`            | Commits — and on an empty group, opens its first task           |
| The new-group `…` | `Enter`            | Makes the group and opens its first task                        |

The title's press has two lengths in it, and a buzz at each: hold it and let
go at the first to open the name, or keep holding through the second to carry
the group. Nothing else on the sheet works that way — a task lifts at the
first — because nothing else has two things worth reaching by holding.

Folded, the icon reads `(1/3)`: what is still to do, out of what is hidden.
Half done counts as still to do. With nothing in the group done it reads `(3)`,
since both halves of the fraction would be the same number.

Enter on the name commits it. On a group with nothing in it yet it also opens
the first task, because naming a group and writing the first thing into it is
one motion; on a group that already has tasks it does not, because somebody
there came to change the name and is done. Backspace on that empty first row
goes back to the name, which is where it came from.

The mark out in the margin has two jobs and is never drawn without one. While
there is something in the group still to do it clears the finished tasks; once
there is nothing left to do it removes the group, tasks and all. Both leave an
undo. It is only offered with the group in hand — while the name is open, or
while the group is folded — so a list being read does not grow a column of
live deletes down its side.

The `…` under the last group makes a new one, and Enter there opens its first
task straight away — a group just made is certainly empty. Tapping away
instead just makes the group. A task dragged onto that row makes one on the
spot and becomes its first, arriving unnamed.

While a group is in hand the corner answers for it. The theme and the burger
go — neither has anything to say to a group being carried — and the paper's
top-right corner turns down in their place, torn edge and all, showing a bin
in the room it clears. Let the group go on that fold and it is removed, tasks
and all, done or not, with the usual ten-second `UNDO?`.

The list name stays, with a dashed box round it: that is somewhere the group
can be put down too. Carry it there and the lists open under the name — one
row per list, and `NEW LIST` under them — and they close again if the group is
taken back to the sheet, so the column is never lying across a list being
carried over. The row under the group is dashed the way the switcher itself
is. Drop it on a list and the group moves there whole — its tasks, their
words, and their half-done ticks. Drop it on `NEW LIST` and a list is made on
this device with that group on it, named after the group, and it stays on this
device until it is synced. The switcher is there for this even when there is
only one list, since that is the device with most to gain from a second; it is
not offered while a sync is in flight.

Undo puts things back the way they were. A group moved to a list that already
existed comes back here and leaves that list exactly as it found it; a group
moved to a list the drop invented brings the list back down with it, and a
device that had one list before has one list again.

### The sheet, and the back of it

| Where          | Gesture                | What happens                                               |
| -------------- | ---------------------- | ---------------------------------------------------------- |
| The sheet      | Drag rightwards        | Turns the paper over to the menu — from bare paper         |
| The menu       | Drag rightwards        | Turns it back, from anywhere on it, buttons included       |
| Top right      | Tap the burger         | The same turn, without the drag                            |
| Top right      | Hold the burger        | Turns the debug switch on and off — see below              |
| The code field | Tap it while empty     | Pastes the code from the clipboard, if there is one there  |
| Top right      | Tap the theme mark     | Theme: the opposite of the phone, then following it again  |
| Top left       | Tap the mark           | Syncs. It is only there when there is something to say     |
| The list name  | Tap                    | Opens the list switcher, once there is a second list       |
| The list name  | Two taps               | Straight to the next list, without opening anything        |
| A message      | Tap `UNDO?`            | Puts back what the message is about                        |
| A message      | Throw it up or right   | Dismisses it. Down is the sheet's scroll, left is the turn |
| A panel        | Drag down, `Esc`, or ✕ | Closes it                                                  |

The menu holds one button that takes something away, and it reads LEAVE where
the list has a code and DELETE where it has not: with a code the list carries
on without this device and can be come back to, and without one this device is
the only place it has ever been. Both stop and ask first, and both leave the
same ten-second `UNDO?` everything else here does — the list comes back with
its code, its folded groups and its place in the switcher.

JOIN asks what to do with the tasks already here, and neither answer throws
anything away. Take them and they go to the list being joined; leave them and
they stay on the list they are on, which stays on this device beside the one
arriving. The switcher then shows both.

The paper only ever spins one way, so a swipe rightwards turns it whichever
side is showing. On the sheet the drag has to start on bare paper, because
every control there already owns a press — the ones that lift a task and a
group. On the menu it can start anywhere: nothing in there owns a press, and a
drag that crossed a button does not press it.

Tick three tasks inside five seconds and a message offers to clear exactly
those three. It is only ever an offer — nothing sweeps the sheet by itself —
and it is made once per run rather than once per tick after the third.

A message with `UNDO?` on it stands for ten seconds after anything that takes
something away — a deleted task, a cleared group, a removed group, a list left
or deleted — and after a move made with a finger, which is the one change that leaves no trace of
where the thing came from. A move made with `Alt+↑/↓` says where the task went
instead: it is exact, and a run of them would raise a message a step.

The menu holds one thing that is not about the list: a debug switch, which
outlines every box on the page in red and keeps a log of what each sync
attempt did. It is not on the panel at all until it is on — holding the burger
is what turns it on, with a buzz to say the press landed, and the button it
puts there is what turns it off again. Nothing about it syncs or leaves the
device.

### What the sheet reads

Counts and prices are read off the text and never stored beside it. A number
at the front of a task is how many (`2x apples`, `3 lemons`); a number at the
end is what it costs (`Bread 2,50`). Both `,` and `.` work as the decimal
mark, and a group writes the whole column the way most of it was written.

The group total is what is **still to buy** — done does not count, half counts
in full, and a row counts as its count times its price. It stays while the
group is folded, which is when it is worth most.

An address in a task is drawn as what it points at rather than as every
character of how to get there, and opens in its own tab. Nothing about any of
this changes the text: what you typed is what is stored, synced and exported.

## What it doesn't do

- **Lose the code, lose the list.** There's no account, no email, no
  recovery. EXPORT copies the whole list to the clipboard as markdown, and
  it's the only backup this app has.
- **A shared code can't be taken back.** Anyone holding it has full read and
  write access. LEAVE only removes the list from your own device, so if a
  code leaks the only remedy is for everyone to agree on a fresh one and join
  that instead. There's no revocation and no per-person permissions.
- **Sync happens when you ask for it.** Tapping SYNC pushes your changes and
  pulls theirs; nothing moves on its own. An edit you never sync reaches
  nobody, and is lost if the device is. The corner of the sheet shows an
  outbox arrow whenever you have unsent changes.
- **A list nobody edits for six months is removed from the server.** Editing
  keeps it alive; reading doesn't.
- **End-to-end encryption protects the data at rest**, not against the origin
  serving the JavaScript. That's true of every web app of this shape, and
  worth being clear-eyed about.

## Licence

One face, everywhere: **Graphe**, drawn by the owner of this project. Titles
and body differ by size and caps, not by typeface.

Graphe Alpha is licensed under the [SIL Open Font
License](https://heracl.es/graphe/) — see that page for the font itself and
its terms. Notes on swapping it for a different face, and a couple of known
gaps in its character set, are in
[TECHNICAL.md](./TECHNICAL.md#the-typeface).

## More

The deployment runbook, the CI internals, the full gate list, and a few
smaller technical notes — Greek capitalisation, swapping the typeface — live
in [TECHNICAL.md](./TECHNICAL.md) rather than here.

---

_Dialectic Acheropoieton_  
_of Heracles Papatheodorou and Claude_

# /listula

A local-first, multiplayer grocery and task list, as a web app.

Two or more people connect to the same list with a short code. It's private
by design: no accounts, no tracking, no analytics, and nobody but the people
you share the code with can read what's on the list. It works with the
network off, and installs to a home screen like a native app.

Design-first and back to basics: black on white, handwritten, no chrome —
built with the kind of attention to detail and small delights of something
drawn by hand rather than assembled from a component library. The sheet is a
sheet, and the only words on it are the ones someone wrote.

- Project page: [heracl.es/listula](https://heracl.es/listula)
- Demo: [listula.vercel.app](https://listula.vercel.app)
- Source: [github.com/arty2/listula](https://github.com/arty2/listula)

It's deployed and working today. Running it, contributing to it, the
deployment runbook and the rest of the technical detail — including how the
privacy actually works — live in [TECHNICAL.md](./TECHNICAL.md), linked again
at the bottom of this file.

## The name

"Listula" is the diminutive of _lista_, the medieval Latin for a list — a
little list.

## Using it

Groups of tasks on a sheet of paper. Write a task, tick it off, or pick it up
and put it somewhere else; a group can be folded away, cleared of what's
finished, or carried over to another list. A count or a price typed into a
task — `2x apples`, `Bread 2,50` — is read off the words and totalled down
the group, without ever being stored as anything but the words you typed.

Nothing on the sheet is labelled, and that is the point. One tap does the
common thing, a second opens it for editing, a long press picks it up, and a
pull leftwards ticks a task off. Every gesture the app answers to is written
down in [TECHNICAL.md](./TECHNICAL.md#gestures) — that list is a live record,
so if a gesture there disagrees with the app, the app is right and the file
is a bug.

### Sharing a list

Tap SYNC, in the menu behind the burger at the top right. That is what puts
the list on the server and mints its code: twelve hex characters, shown in
groups of four for reading aloud. SHARE then hands over the link and the code
together in one message — either half alone is useless — and COPY takes the
code on its own, for pasting into a conversation already open.

Whoever receives it opens the app and puts the code into JOIN, which takes it
straight out of a pasted invitation. Both devices then hold the same list,
and tapping SYNC on either pushes what you wrote and pulls what they wrote.
Nothing moves on its own.

The code is the list: it is what your copy is encrypted with, it never
travels in a URL, and it is the whole of what the other person needs. So
anyone holding it can read and write the list, and there is no taking it
back.

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

Running it, contributing to it, the full gesture reference, the deployment
runbook, the CI internals, the gate list, and a few smaller technical notes —
Greek capitalisation, swapping the typeface — live in
[TECHNICAL.md](./TECHNICAL.md) rather than here.

---

_Dialectic Acheropoieton_  
_of Heracles Papatheodorou and Claude_

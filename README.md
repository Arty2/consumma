# /consumma

A shared checklist that the server cannot read. Two or more people connect to
the same list with a short code; everything is encrypted in the browser, and
what reaches the server is ciphertext and a room id derived from the same
code.

Black on white, handwritten, no chrome. The sheet is a sheet, and the only
words on it are the ones someone wrote.

- Project page: [heracl.es/consumma](https://heracl.es/consumma)
- Demo: [consumma.vercel.app](https://consumma.vercel.app)
- Source: [github.com/arty2/consumma](https://github.com/arty2/consumma)

Deployed and working: the app runs, syncs between devices, installs to a home
screen and works with the network off. The deployment runbook and the rest of
the technical detail live in [TECHNICAL.md](./TECHNICAL.md), linked again at
the bottom of this file.

## The name

"Consumma" comes from the Latin _consummare_, to complete. When the last open
task on a list is ticked, the app says so once, quietly: the toast reads
_Consummatum_ — "it is finished."

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

## Gestures

A couple of things aren't discoverable just by looking at the sheet, which is
the accepted cost of keeping it clean.

- **Long-press a checkbox to set a task half done.** Tapping toggles it
  between to-do and done; holding for about half a second gives you the third
  state. Holding a half-done task returns it to to-do. On a keyboard, `Space`
  toggles and `Shift+Space` sets half.
- **Long-press the text of a row to pick it up and drag it**, including into
  another group. There's no drag handle. The checkbox keeps its own
  long-press, so the two gestures never collide.

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

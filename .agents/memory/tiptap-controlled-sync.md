---
name: TipTap controlled-editor external sync
description: How to sync a controlled rich-text editor with server refetches without clobbering in-progress typing
---

Syncing a controlled TipTap (or any rich-text) editor with a server value that
can refetch (window focus, post-save query invalidation) needs a TWO-LAYER guard
or it clobbers what the user is typing:

1. Parent-level ref (`isEditingNoteRef`) gated so a background refetch doesn't push
   stale server text into the draft state while the field is focused.
2. Editor-level: the value->editor sync effect must early-return when
   `editor.isFocused`, and only `setContent(value, false)` when the serialized
   current content differs from the incoming value.

**Why:** TipTap is uncontrolled internally; naive `setContent` on every value
change resets the cursor and erases live edits. A single guard isn't enough because
the draft and the editor are two separate sources of truth.

**How to apply:** Any controlled editor fed by React Query data. Store/serialize
as markdown (via tiptap-markdown `editor.storage.markdown.getMarkdown()`) so plain-
text consumers (e.g. timeline preview) keep working. Pair save-on-blur with a short
debounced autosave; saveNote must no-op when unchanged so the two don't fight.

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  /** Markdown source. */
  value: string;
  /** Fires with serialized markdown on every edit. */
  onChange: (markdown: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Wrapper class (sizing, scroll, etc.). */
  className?: string;
}

/**
 * Notion-style live-markdown editor. Type `# `, `- `, `1. `, `- [ ] `, `> `,
 * ```` ``` ````, `**bold**`, `*italic*`, etc. and it formats inline as you go.
 * Reads/writes plain markdown (stored on the task-group `description`) so the
 * timeline's plain-text preview keeps working.
 */
export function MarkdownEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
  className,
}: MarkdownEditorProps) {
  // useEditor reads these once. Keep refs so blur/change see the latest parent
  // callbacks — otherwise clicking away saves the note from the first render.
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  onChangeRef.current = onChange;
  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none leading-relaxed focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.storage.markdown.getMarkdown());
    },
    onFocus: () => onFocusRef.current?.(),
    onBlur: () => onBlurRef.current?.(),
  });

  const wrapRef = useRef<HTMLDivElement>(null);

  // Clicking a non-focusable part of the page doesn't always blur the editor.
  // Save as soon as the pointer goes outside the field.
  useEffect(() => {
    if (!editor) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = wrapRef.current;
      if (!root || root.contains(event.target as Node)) return;
      if (!editor.isFocused) return;
      editor.commands.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editor]);

  // Sync external value changes (server load / task switch) into the editor,
  // but never while the user is actively editing — that would clobber typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = editor.storage.markdown.getMarkdown();
    if (current === value) return;
    editor.commands.setContent(value, false);
  }, [value, editor]);

  return (
    <div
      ref={wrapRef}
      className={cn("md-scratchpad cursor-text", className)}
      onClick={() => {
        if (editor && !editor.isFocused) editor.commands.focus();
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

import { useEffect } from "react";
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
      onChange(editor.storage.markdown.getMarkdown());
    },
    onFocus: () => onFocus?.(),
    onBlur: () => onBlur?.(),
  });

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
      className={cn("md-scratchpad cursor-text", className)}
      onClick={() => {
        if (editor && !editor.isFocused) editor.commands.focus();
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}

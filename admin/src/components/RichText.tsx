import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { useEffect } from 'react';

export default function RichText({ value, onChange, id }: { value: string; onChange: (html: string) => void; id?: string }) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }), Image],
    content: value,
    editorProps: { attributes: { class: 'prose-body min-h-[260px] rounded-b-lg border border-slate-300 bg-white p-4 focus:outline-none', ...(id ? { id } : {}) } },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  useEffect(() => { if (editor && value !== editor.getHTML()) editor.commands.setContent(value, false); }, [value, editor]);
  if (!editor) return null;
  const B = ({ on, active, label, title }: { on: () => void; active?: boolean; label: string; title: string }) =>
    <button type="button" title={title} aria-label={title} onClick={on} className={`rounded px-2 py-1 text-sm ${active ? 'bg-slate-900 text-white' : 'hover:bg-slate-200'}`}>{label}</button>;
  const addLink = () => { const url = window.prompt('Link URL (https://…)'); if (url === null) return; if (url === '') editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run(); };
  const addImage = () => { const url = window.prompt('Image URL (https://…)'); if (url) editor.chain().focus().setImage({ src: url }).run(); };
  return (
    <div>
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-slate-300 bg-slate-50 p-1.5">
        <B title="Bold" label="B" active={editor.isActive('bold')} on={() => editor.chain().focus().toggleBold().run()} />
        <B title="Italic" label="I" active={editor.isActive('italic')} on={() => editor.chain().focus().toggleItalic().run()} />
        <B title="Heading 2" label="H2" active={editor.isActive('heading', { level: 2 })} on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <B title="Heading 3" label="H3" active={editor.isActive('heading', { level: 3 })} on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <B title="Bullet list" label="• List" active={editor.isActive('bulletList')} on={() => editor.chain().focus().toggleBulletList().run()} />
        <B title="Numbered list" label="1. List" active={editor.isActive('orderedList')} on={() => editor.chain().focus().toggleOrderedList().run()} />
        <B title="Quote" label="“ ”" active={editor.isActive('blockquote')} on={() => editor.chain().focus().toggleBlockquote().run()} />
        <B title="Link" label="Link" active={editor.isActive('link')} on={addLink} />
        <B title="Image by URL" label="Image" on={addImage} />
        <B title="Undo" label="↶" on={() => editor.chain().focus().undo().run()} />
        <B title="Redo" label="↷" on={() => editor.chain().focus().redo().run()} />
      </div>
      <EditorContent editor={editor} />
    </div>);
}

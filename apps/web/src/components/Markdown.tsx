import { memo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

/** Copy-to-clipboard button overlay for fenced code blocks. */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    const text = preRef.current?.textContent ?? '';
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute right-2 top-2 hidden rounded-md border border-slate-600 bg-slate-800/90 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 group-hover:block"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre ref={preRef} className="hljs rounded-xl bg-slate-950 p-4 text-xs leading-relaxed overflow-x-auto">
        {children}
      </pre>
    </div>
  );
}

/**
 * Renders assistant messages as Markdown: GFM tables/checklists, fenced code
 * with highlight.js classes, and safe links (target=_blank, no referrer).
 * While `streaming`, a pulsing cursor follows the last block.
 */
const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <div className={`md-body text-sm${streaming ? ' streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-700 bg-slate-900 px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-slate-700 px-2 py-1">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;

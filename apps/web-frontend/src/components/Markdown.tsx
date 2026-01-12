import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownProps {
  content: string;
  className?: string;
}

const components: Components = {
  // Headers
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mt-6 mb-3 text-foreground border-b border-border pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold mt-5 mb-2 text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-medium mt-4 mb-2 text-foreground">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-medium mt-3 mb-1.5 text-foreground">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-medium mt-2 mb-1 text-foreground">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-medium mt-2 mb-1 text-muted-foreground">
      {children}
    </h6>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed text-foreground/90">
      {children}
    </p>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="mb-3 ml-4 space-y-1 list-disc list-outside marker:text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-4 space-y-1 list-decimal list-outside marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="pl-1 text-foreground/90">
      {children}
    </li>
  ),

  // Tables
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/50">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">
      {children}
    </tbody>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-muted/30">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-foreground border-b border-border">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-foreground/90">
      {children}
    </td>
  ),

  // Code
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-muted/70 rounded-lg p-4 text-sm font-mono overflow-x-auto border border-border">
          {children}
        </code>
      );
    }
    return (
      <code className="px-1.5 py-0.5 bg-muted/70 rounded text-sm font-mono text-foreground">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 overflow-hidden rounded-lg">
      {children}
    </pre>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="my-4 pl-4 border-l-4 border-primary/50 bg-primary/5 py-2 pr-4 rounded-r-lg italic text-foreground/80">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
    >
      {children}
    </a>
  ),

  // Emphasis
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic">
      {children}
    </em>
  ),
  del: ({ children }) => (
    <del className="line-through text-muted-foreground">
      {children}
    </del>
  ),

  // Horizontal rule
  hr: () => (
    <hr className="my-6 border-border" />
  ),

  // Images
  img: ({ src, alt }) => (
    <img 
      src={src} 
      alt={alt || ''} 
      className="my-4 max-w-full h-auto rounded-lg border border-border"
    />
  ),
};

export function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

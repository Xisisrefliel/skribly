import { useState, useMemo, type ReactNode, type ElementType } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify } from './TableOfContents';

interface MarkdownProps {
  content: string;
  className?: string;
  collapsible?: boolean;
}

// Track which sections are collapsed
type CollapsedState = Record<string, boolean>;

interface HeadingInfo {
  id: string;
  text: string;
  level: number;
}

/**
 * Pre-compute all heading IDs from content in a single pass.
 * Returns a list of headings in order with their unique IDs.
 */
function extractAllHeadings(content: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const lines = content.split('\n');
  const seenIds = new Map<string, number>();
  
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const baseId = slugify(text);
      
      // Create unique ID for duplicate headings
      let id: string;
      if (seenIds.has(baseId)) {
        const count = seenIds.get(baseId)! + 1;
        seenIds.set(baseId, count);
        id = `${baseId}-${count}`;
      } else {
        seenIds.set(baseId, 1);
        id = baseId;
      }
      
      headings.push({ id, text, level });
    }
  }
  
  return headings;
}

/**
 * Create a map from heading text to its ID for quick lookup.
 * Handles duplicates by tracking occurrence count.
 */
function createHeadingIdMap(headings: HeadingInfo[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  
  for (const heading of headings) {
    const key = heading.text.toLowerCase();
    const ids = map.get(key) || [];
    ids.push(heading.id);
    map.set(key, ids);
  }
  
  return map;
}

interface CollapsibleHeadingProps {
  level: number;
  id: string;
  children: ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  collapsible: boolean;
}

function CollapsibleHeading({ 
  level, 
  id, 
  children, 
  isCollapsed, 
  onToggle, 
  collapsible 
}: CollapsibleHeadingProps) {
  const baseClasses = 'font-semibold text-foreground flex items-center gap-2 group scroll-mt-24';
  
  const levelClasses: Record<number, string> = {
    1: 'text-xl mt-6 mb-3 border-b border-border pb-2',
    2: 'text-lg mt-5 mb-2',
    3: 'text-base mt-4 mb-2',
    4: 'text-sm mt-3 mb-1.5',
    5: 'text-sm mt-2 mb-1',
    6: 'text-xs mt-2 mb-1 text-muted-foreground',
  };

  const HeadingTag = `h${level}` as ElementType;
  const showToggle = collapsible && (level === 1 || level === 2);

  return (
    <HeadingTag 
      id={id} 
      className={cn(baseClasses, levelClasses[level])}
    >
      {showToggle && (
        <button
          onClick={onToggle}
          className="collapsible-toggle p-0.5 -ml-6 rounded hover:bg-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      )}
      <span className="flex-1">{children}</span>
    </HeadingTag>
  );
}

export function Markdown({ content, className = '', collapsible = false }: MarkdownProps) {
  const [collapsedSections, setCollapsedSections] = useState<CollapsedState>({});
  
  // Pre-compute all heading IDs once when content changes
  const headings = useMemo(() => extractAllHeadings(content), [content]);
  const headingIdMap = useMemo(() => createHeadingIdMap(headings), [headings]);
  
  // Track which occurrence of each heading text we're rendering
  const occurrenceCounters = useMemo(() => new Map<string, number>(), [content]);

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Get the ID for a heading based on its text
  const getHeadingId = (text: string): string => {
    const key = text.toLowerCase();
    const ids = headingIdMap.get(key);
    if (!ids || ids.length === 0) {
      return slugify(text);
    }
    
    const occurrence = occurrenceCounters.get(key) || 0;
    occurrenceCounters.set(key, occurrence + 1);
    
    return ids[occurrence] || ids[0];
  };

  // Create heading components with IDs
  const createHeading = (level: number) => {
    return function Heading({ children }: { children?: ReactNode }) {
      const text = String(children || '');
      const id = getHeadingId(text);
      const isCollapsed = collapsedSections[id] || false;

      return (
        <CollapsibleHeading
          level={level}
          id={id}
          isCollapsed={isCollapsed}
          onToggle={() => toggleSection(id)}
          collapsible={collapsible}
        >
          {children}
        </CollapsibleHeading>
      );
    };
  };

  const components: Components = useMemo(() => ({
    // Headers with IDs and collapsible functionality
    h1: createHeading(1),
    h2: createHeading(2),
    h3: createHeading(3),
    h4: createHeading(4),
    h5: createHeading(5),
    h6: createHeading(6),

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [collapsible, collapsedSections, headingIdMap]);

  return (
    <div className={cn('markdown-content', collapsible && 'pl-6', className)}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

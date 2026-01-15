import { useState, useMemo, useRef, type ReactNode, type ElementType } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Components } from 'react-markdown';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify } from './TableOfContents';
import 'katex/dist/katex.min.css';

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
 * Preprocess content to convert square bracket math syntax [ ... ] to LaTeX inline math $ ... $
 * This supports the user's preferred syntax for mathematical expressions.
 * 
 * Handles patterns like:
 * - [ \frac{106{,}50}{104}\times100 - 100 = 2{,}40% ]
 * - [ \text{Rate} = \left(\frac{\text{neuer Indexstand}}{\text{alter Indexstand}} \times 100\right) - 100 ]
 */
function preprocessMath(content: string): string {
  // Skip content that's already in LaTeX math format $ ... $, \( ... \), or \[ ... \]
  // We only want to convert [ ... ] patterns that aren't already math
  
  let result = content;
  const positions: Array<{ start: number; end: number; content: string }> = [];
  
  // Find all [ ... ] patterns
  let i = 0;
  while (i < result.length) {
    if (result[i] === '[') {
      const start = i;
      
      // Check if this might be part of existing LaTeX math \( or \[
      if (i > 0 && result[i - 1] === '\\') {
        i++;
        continue;
      }
      
      // Find matching closing bracket, handling nested brackets and parentheses
      let depth = 0;
      let parenDepth = 0;
      let found = false;
      let end = i + 1;
      
      for (let j = i + 1; j < result.length; j++) {
        const char = result[j];
        const prevChar = j > 0 ? result[j - 1] : '';
        
        // Skip escaped characters
        if (prevChar === '\\') {
          continue;
        }
        
        if (char === '[') {
          depth++;
        } else if (char === ']') {
          if (depth === 0 && parenDepth === 0) {
            end = j;
            found = true;
            break;
          }
          depth--;
        } else if (char === '(') {
          parenDepth++;
        } else if (char === ')') {
          parenDepth--;
        }
      }
      
      if (found) {
        const mathContent = result.substring(start + 1, end);
        const afterMatch = result.substring(end + 1).trim();
        
        // Skip markdown links [text](url)
        if (afterMatch.startsWith('(') && !mathContent.includes('\\')) {
          i = end + 1;
          continue;
        }
        
        // Check if content contains LaTeX commands
        const hasLatexCommand = /\\[a-zA-Z]+/.test(mathContent);
        
        if (hasLatexCommand) {
          positions.push({ start, end, content: mathContent });
        }
        
        i = end + 1;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  
  // Replace from end to start to preserve indices
  // Use $...$ syntax which is more widely supported by remark-math
  for (let idx = positions.length - 1; idx >= 0; idx--) {
    const { start, end, content } = positions[idx];
    result = result.substring(0, start) + `$${content}$` + result.substring(end + 1);
  }
  
  return result;
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
  const baseClasses = 'font-semibold text-foreground flex w-full min-w-0 items-center gap-2 group scroll-mt-24 relative';
  
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
          className={cn(
            "collapsible-toggle absolute -left-6 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent transition-colors focus:opacity-100",
            isCollapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
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
  
  // Preprocess content to convert [ ... ] math syntax to LaTeX
  const processedContent = useMemo(() => preprocessMath(content), [content]);
  
  // Pre-compute all heading IDs once when content changes
  const headings = useMemo(() => extractAllHeadings(processedContent), [processedContent]);
  const headingIdMap = useMemo(() => createHeadingIdMap(headings), [headings]);
  
  // Track which occurrence of each heading text we're rendering
  const occurrenceCounters = useMemo(() => new Map<string, number>(), [content]);
  
  // Track section hierarchy: stack of active sections (most recent at top)
  // Each entry is { id: string, level: number }
  const sectionStack = useRef<Array<{ id: string; level: number }>>([]);
  
  // Reset section stack on every render to ensure clean state
  // This fixes the issue where collapsing a section would hide subsequent headings
  // or headings in the next render pass due to stale stack state
  sectionStack.current = [];

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Check if any parent section in the stack is collapsed
  const isAnyParentCollapsed = (): boolean => {
    if (!collapsible) return false;
    return sectionStack.current.some(section => collapsedSections[section.id]);
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
      
      // Check if any parent section is collapsed (before updating the stack)
      // We only consider sections with lower level (ancestors) as parents
      const ancestors = sectionStack.current.filter(s => s.level < level);
      const parentCollapsed = collapsible && ancestors.some(s => collapsedSections[s.id]);
      
      // Update section stack: remove all sections at same or higher level, then add this one
      // This maintains the path to the current section
      sectionStack.current = [...ancestors, { id, level }];

      // Hide heading if any parent is collapsed
      if (parentCollapsed) {
        return null;
      }

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

  // Custom paragraph component that can be hidden when section is collapsed
  const createParagraph = () => {
    return function Paragraph({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <p className="mb-3 leading-relaxed text-foreground/90">
          {children}
        </p>
      );
    };
  };

  // Custom list components that can be hidden when section is collapsed
  const createList = (type: 'ul' | 'ol') => {
    return function List({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      const className = type === 'ul' 
        ? "mb-3 ml-4 space-y-1 list-disc list-outside marker:text-muted-foreground"
        : "mb-3 ml-4 space-y-1 list-decimal list-outside marker:text-muted-foreground";
      
      const ListTag = type;
      
      return (
        <ListTag className={className}>
          {children}
        </ListTag>
      );
    };
  };

  // Custom list item component
  const createListItem = () => {
    return function ListItem({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <li className="pl-1 text-foreground/90">
          {children}
        </li>
      );
    };
  };

  // Custom table components that can be hidden when section is collapsed
  const createTable = () => {
    return function Table({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <div className="my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      );
    };
  };

  const createTableSection = (type: 'thead' | 'tbody') => {
    return function TableSection({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      const className = type === 'thead' ? "bg-muted/50" : "divide-y divide-border";
      const Tag = type;
      
      return (
        <Tag className={className}>
          {children}
        </Tag>
      );
    };
  };

  const createTableRow = () => {
    return function TableRow({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <tr className="transition-colors hover:bg-muted/30">
          {children}
        </tr>
      );
    };
  };

  const createTableCell = (type: 'th' | 'td') => {
    return function TableCell({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      const className = type === 'th' 
        ? "px-4 py-2.5 text-left font-semibold text-foreground border-b border-border"
        : "px-4 py-2.5 text-foreground/90";
      const Tag = type;
      
      return (
        <Tag className={className}>
          {children}
        </Tag>
      );
    };
  };

  // Custom code component that can be hidden when section is collapsed
  // Also handles math expressions rendered by rehype-katex
  const createCode = () => {
    return function Code({ className, children }: { className?: string; children?: ReactNode }) {
      // Check if this is a math expression (rehype-katex processes math nodes)
      // After rehype-katex processing, math is rendered as HTML
      const isMath = className?.includes('math');
      if (isMath) {
        // Math expressions should still be hidden if parent is collapsed
        if (isAnyParentCollapsed()) {
          return null;
        }
        // rehype-katex converts math code nodes to HTML elements
        // Return children directly without wrapping in code tag
        // The className and other props are preserved by rehype-katex
        return <>{children}</>;
      }

      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

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
    };
  };

  const createPre = () => {
    return function Pre({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <pre className="my-4 overflow-hidden rounded-lg">
          {children}
        </pre>
      );
    };
  };

  // Custom blockquote component that can be hidden when section is collapsed
  const createBlockquote = () => {
    return function Blockquote({ children }: { children?: ReactNode }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <blockquote className="my-4 pl-4 border-l-4 border-primary/50 bg-primary/5 py-2 pr-4 rounded-r-lg italic text-foreground/80">
          {children}
        </blockquote>
      );
    };
  };

  // Custom horizontal rule component
  const createHr = () => {
    return function Hr() {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <hr className="my-6 border-border" />
      );
    };
  };

  // Custom image component
  const createImage = () => {
    return function Image({ src, alt }: { src?: string; alt?: string }) {
      if (isAnyParentCollapsed()) {
        return null; // Hide content when any parent section is collapsed
      }

      return (
        <img 
          src={src} 
          alt={alt || ''} 
          className="my-4 max-w-full h-auto rounded-lg border border-border"
        />
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
    p: createParagraph(),

    // Lists
    ul: createList('ul'),
    ol: createList('ol'),
    li: createListItem(),

    // Tables
    table: createTable(),
    thead: createTableSection('thead'),
    tbody: createTableSection('tbody'),
    tr: createTableRow(),
    th: createTableCell('th'),
    td: createTableCell('td'),

    // Code
    code: createCode(),
    pre: createPre(),

    // Blockquotes
    blockquote: createBlockquote(),

    // Horizontal rule
    hr: createHr(),

    // Images
    img: createImage(),

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [collapsible, collapsedSections]);

  return (
    <div className={cn('markdown-content', collapsible && 'pl-6', className)}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

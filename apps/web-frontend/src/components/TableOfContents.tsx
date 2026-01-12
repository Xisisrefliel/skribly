import { useEffect, useState } from 'react';
import { List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  content: string;
  className?: string;
}

/**
 * Generate a slug from heading text for use as an ID
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Extract headings from markdown content.
 * Processes ALL headings (h1-h6) to generate consistent IDs,
 * but only returns h2 and h3 for display in the TOC.
 */
export function extractHeadings(content: string): TOCItem[] {
  const headings: TOCItem[] = [];
  const lines = content.split('\n');
  const seenIds = new Map<string, number>();

  for (const line of lines) {
    // Match ALL headings (h1-h6) for consistent ID generation
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      let id = slugify(text);

      // Handle duplicate IDs by appending a number
      if (seenIds.has(id)) {
        const count = seenIds.get(id)! + 1;
        seenIds.set(id, count);
        id = `${id}-${count}`;
      } else {
        seenIds.set(id, 1);
      }

      // Only include h2 and h3 in the TOC display
      if (level === 2 || level === 3) {
        headings.push({ id, text, level });
      }
    }
  }

  return headings;
}

export function TableOfContents({ content, className }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  // Extract headings when content changes
  useEffect(() => {
    const extracted = extractHeadings(content);
    setHeadings(extracted);
  }, [content]);

  // Scroll spy: update activeId based on scroll position
  useEffect(() => {
    if (headings.length === 0) return;

    const handleScroll = () => {
      // Get all heading elements in DOM order
      const headingElements = headings
        .map(h => ({ id: h.id, element: document.getElementById(h.id) }))
        .filter((h): h is { id: string; element: HTMLElement } => h.element !== null);

      if (headingElements.length === 0) return;

      // Find the heading that's currently at or above the viewport top
      const scrollY = window.scrollY + 120; // Offset for header
      
      let currentId = headingElements[0].id;
      
      for (const { id, element } of headingElements) {
        if (element.offsetTop <= scrollY) {
          currentId = id;
        } else {
          break;
        }
      }
      
      setActiveId(currentId);
    };

    // Initial check
    handleScroll();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <Card className={cn('toc-card', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <List className="h-4 w-4" />
          Contents
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <nav aria-label="Table of contents">
          <ul className="space-y-1 text-sm">
            {headings.map((heading) => (
              <li
                key={heading.id}
                className={cn(
                  heading.level === 3 && 'ml-3',
                )}
              >
                <a
                  href={`#${heading.id}`}
                  className={cn(
                    'toc-item block w-full text-left py-1 px-2 rounded-md transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:outline-none focus-visible:outline-none',
                    activeId === heading.id && 'toc-item-active bg-accent text-accent-foreground font-medium',
                    activeId !== heading.id && 'text-muted-foreground',
                  )}
                >
                  <span className="line-clamp-2">{heading.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </CardContent>
    </Card>
  );
}

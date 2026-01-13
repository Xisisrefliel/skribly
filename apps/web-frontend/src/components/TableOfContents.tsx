import { useEffect, useState, useRef } from 'react';
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
  maxHeight?: string;
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

export function TableOfContents({ content, className, maxHeight }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TOCItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

      // Find the heading that's currently active using intersection/position
      // We look for the last heading that has passed the "reading line" (top of screen)
      const topOffset = 150; // Buffer for header + some breathing room
      
      let currentId = headingElements[0].id;
      
      for (const { id, element } of headingElements) {
        const rect = element.getBoundingClientRect();
        
        // If the element is above or near the reading line, it's a candidate
        if (rect.top < topOffset) {
          currentId = id;
        } else {
          // As soon as we hit an element below the line, we know the *previous* one is active
          break;
        }
      }
      
      setActiveId(currentId);
    };

    // Initial check
    handleScroll();
    
    // Use passive listener for better performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  // Sync TOC scroll position with active item
  useEffect(() => {
    if (!activeId || !scrollContainerRef.current) return;

    const activeLink = scrollContainerRef.current.querySelector(`a[href="#${activeId}"]`);
    if (activeLink) {
      // Use scrollIntoView with 'nearest' to avoid unnecessary movement if already visible
      // but ensure it stays in view. 'smooth' gives it that polished feel.
      activeLink.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', 
      });
    }
  }, [activeId]);

  if (headings.length === 0) {
    return null;
  }

  return (
    <Card 
      className={cn('toc-card py-6 flex flex-col !gap-2 neu-panel', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <CardHeader className="pb-0 flex-shrink-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <List className="h-4 w-4" />
          Contents
        </CardTitle>
      </CardHeader>
      <CardContent 
        ref={scrollContainerRef}
        className="pt-0 flex-1 min-h-0 overflow-y-auto scrollbar-hide overscroll-contain"
      >
        <nav 
          aria-label="Table of contents"
        >
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
                    activeId === heading.id ? 'toc-item-active' : 'text-muted-foreground',
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

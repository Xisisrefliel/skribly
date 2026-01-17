import { mdToPdf } from 'md-to-pdf';
import { r2Service } from './r2.js';

export interface PDFResult {
  pdfUrl: string;
  pdfKey: string;
}

// Custom CSS for beautiful PDF rendering
const PDF_STYLES = `
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 12pt;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 100%;
  padding: 0;
  margin: 0;
}

h1 {
  font-size: 24pt;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 16pt;
  color: #000;
  border-bottom: 2px solid #e5e5e5;
  padding-bottom: 8pt;
}

h2 {
  font-size: 18pt;
  font-weight: 600;
  margin-top: 24pt;
  margin-bottom: 12pt;
  color: #1a1a1a;
}

h3 {
  font-size: 14pt;
  font-weight: 600;
  margin-top: 20pt;
  margin-bottom: 8pt;
  color: #333;
}

h4 {
  font-size: 12pt;
  font-weight: 600;
  margin-top: 16pt;
  margin-bottom: 6pt;
  color: #444;
}

p {
  margin: 0 0 12pt 0;
}

ul, ol {
  margin: 0 0 12pt 0;
  padding-left: 24pt;
}

li {
  margin-bottom: 6pt;
}

strong {
  font-weight: 600;
  color: #000;
}

em {
  font-style: italic;
}

code {
  font-family: 'SF Mono', Menlo, Monaco, 'Courier New', monospace;
  font-size: 10pt;
  background-color: #f5f5f5;
  padding: 2pt 4pt;
  border-radius: 3pt;
}

pre {
  background-color: #f5f5f5;
  padding: 12pt;
  border-radius: 6pt;
  overflow-x: auto;
  margin: 0 0 12pt 0;
}

pre code {
  background: none;
  padding: 0;
}

blockquote {
  border-left: 4pt solid #3b82f6;
  margin: 0 0 12pt 0;
  padding: 8pt 0 8pt 16pt;
  color: #666;
  font-style: italic;
  background-color: #f8fafc;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16pt 0;
  table-layout: fixed;
  word-wrap: break-word;
}

th {
  background-color: #f5f5f5;
  font-weight: 600;
  text-align: left;
  padding: 6pt 4pt;
  border: 1pt solid #e5e5e5;
  overflow: hidden;
  text-overflow: ellipsis;
}

td {
  padding: 5pt 4pt;
  border: 1pt solid #e5e5e5;
  overflow: hidden;
  text-overflow: ellipsis;
}

tr:nth-child(even) {
  background-color: #fafafa;
}

hr {
  border: none;
  border-top: 1pt solid #e5e5e5;
  margin: 20pt 0;
}

a {
  color: #3b82f6;
  text-decoration: none;
}

/* Table size classes based on column count */
.table-cols-3 { font-size: 9pt; }
.table-cols-4 { font-size: 8pt; }
.table-cols-5 { font-size: 7pt; }
.table-cols-6 { font-size: 6.5pt; }
.table-cols-7 { font-size: 6pt; }
.table-cols-8 { font-size: 5.5pt; }
.table-cols-9 { font-size: 5pt; }
.table-cols-10 { font-size: 4.5pt; }
.table-cols-many { font-size: 4pt; }

.table-cols-3 th, .table-cols-3 td { padding: 5pt 4pt; }
.table-cols-4 th, .table-cols-4 td { padding: 4pt 3pt; }
.table-cols-5 th, .table-cols-5 td { padding: 4pt 3pt; }
.table-cols-6 th, .table-cols-6 td { padding: 3pt 2pt; }
.table-cols-7 th, .table-cols-7 td { padding: 3pt 2pt; }
.table-cols-8 th, .table-cols-8 td { padding: 2pt 2pt; }
.table-cols-9 th, .table-cols-9 td { padding: 2pt 1pt; }
.table-cols-10 th, .table-cols-10 td { padding: 2pt 1pt; }
.table-cols-many th, .table-cols-many td { padding: 2pt 1pt; }
`;

const MATHJAX_SCRIPT = `
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']],
    },
    svg: { fontCache: 'global' },
  };
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
`;

/**
 * Parse inline markdown formatting to HTML
 */
function parseInlineMarkdown(text: string): string {
  return text
    // Bold + Italic (must come before bold and italic)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

/**
 * Parse a markdown table and convert to HTML with appropriate sizing class
 */
function parseMarkdownTable(lines: string[]): string {
  if (lines.length < 2) return lines.join('\n');

  const headerLine = lines[0];
  const separatorLine = lines[1];

  // Verify it's a table (separator line has dashes)
  if (!separatorLine.match(/^\|?[\s\-:|]+\|?$/)) {
    return lines.join('\n');
  }

  // Parse header cells
  const parseRow = (line: string): string[] => {
    return line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());
  };

  const headers = parseRow(headerLine);
  const columnCount = headers.length;

  // Determine size class
  let sizeClass = '';
  if (columnCount >= 11) {
    sizeClass = 'table-cols-many';
  } else if (columnCount >= 3) {
    sizeClass = `table-cols-${columnCount}`;
  }

  // Build HTML table
  let html = `<table class="${sizeClass}">\n<thead>\n<tr>\n`;
  
  for (const header of headers) {
    html += `<th>${parseInlineMarkdown(header)}</th>\n`;
  }
  html += '</tr>\n</thead>\n<tbody>\n';

  // Parse data rows (skip header and separator)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.includes('|')) break;

    const cells = parseRow(line);
    html += '<tr>\n';
    for (let j = 0; j < columnCount; j++) {
      html += `<td>${parseInlineMarkdown(cells[j] || '')}</td>\n`;
    }
    html += '</tr>\n';
  }

  html += '</tbody>\n</table>\n';
  return html;
}

/**
 * Preprocess markdown to convert tables to HTML with sizing classes
 */
function preprocessTables(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect potential table start (has | and not a separator line)
    if (trimmed.includes('|') && !trimmed.match(/^\|?[\s\-:|]+\|?$/)) {
      const nextLine = lines[i + 1]?.trim() || '';

      // Check if next line is a separator
      if (nextLine.match(/^\|?[\s\-:|]+\|?$/) && nextLine.includes('-')) {
        // Collect all table lines
        const tableLines: string[] = [];
        while (i < lines.length) {
          const tableLine = lines[i].trim();
          if (tableLine.includes('|')) {
            tableLines.push(tableLine);
            i++;
          } else {
            break;
          }
        }

        // Convert to HTML
        result.push(parseMarkdownTable(tableLines));
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

export const pdfService = {
  /**
   * Generate a PDF from markdown content
   */
  async generatePDF(markdown: string, title: string): Promise<Buffer> {
    // Validate input
    if (!markdown || !markdown.trim()) {
      throw new Error('Markdown content is empty');
    }

    if (!title || !title.trim()) {
      throw new Error('Title is required');
    }

    // Add title as H1 if not already present
    let content = markdown.trim();
    if (!content.startsWith('# ')) {
      content = `# ${title}\n\n${content}`;
    }

    // Preprocess tables to add sizing classes
    content = preprocessTables(content);

    // Note: We'll skip MathJax for now as it can cause rendering issues
    // If you need math support, consider using a different approach

    try {
      const result = await mdToPdf(
        { content },
        {
          css: PDF_STYLES,
          pdf_options: {
            format: 'A4',
            margin: {
              top: '20mm',
              right: '20mm',
              bottom: '20mm',
              left: '20mm',
            },
            printBackground: true,
          },
          launch_options: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          },
        }
      );

      if (!result || !result.content || result.content.length === 0) {
        console.error('md-to-pdf returned empty content', {
          hasResult: !!result,
          hasContent: !!result?.content,
          contentLength: result?.content?.length,
        });
        throw new Error('PDF generation failed: no content was generated');
      }

      return result.content;
    } catch (error) {
      console.error('PDF generation error:', error);
      if (error instanceof Error) {
        throw new Error(`PDF generation failed: ${error.message}`);
      }
      throw new Error('PDF generation failed: Unknown error');
    }
  },

  /**
   * Generate PDF and upload to R2
   */
  async generateAndUpload(
    transcriptionId: string,
    userId: string,
    markdown: string,
    title: string,
    type: 'structured' | 'raw' = 'structured'
  ): Promise<PDFResult> {
    console.log(`Generating ${type} PDF for transcription: ${transcriptionId}`);

    // Generate PDF
    const pdfBuffer = await this.generatePDF(markdown, title);

    // Create a safe filename
    const safeTitle = title
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
    
    const pdfKey = `pdfs/${userId}/${transcriptionId}/${type}-${safeTitle}.pdf`;

    // Upload to R2
    await r2Service.uploadFile(pdfKey, pdfBuffer, 'application/pdf');

    // Get a signed URL (valid for 24 hours)
    const pdfUrl = await r2Service.getSignedUrl(pdfKey, 86400);

    console.log(`PDF uploaded: ${pdfKey}`);

    return {
      pdfUrl,
      pdfKey,
    };
  },
};

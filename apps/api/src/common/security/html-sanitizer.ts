import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purifier = createDOMPurify(window);

purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName !== 'A' || !node.hasAttribute('href')) return;

  const href = node.getAttribute('href');

  if (!href) {
    node.removeAttribute('href');
    return;
  }

  try {
    const parsed = new URL(href, 'https://relative-link.invalid');

    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol))
      node.removeAttribute('href');
  } catch {
    node.removeAttribute('href');
  }
});

export function sanitizeRichHtml(input: string): string {
  return purifier.sanitize(input, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
      'h2',
      'h3',
      'h4',
    ],

    ALLOWED_ATTR: ['href', 'title'],

    FORBID_ATTR: ['style', 'id', 'name'],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'svg',
      'math',
    ],

    ALLOW_DATA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
  });
}

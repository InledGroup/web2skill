// content.ts
let hoverOverlay: HTMLDivElement | null = null;

chrome.runtime.onMessage.addListener((request: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (request.action === 'detectNav') {
    const navLinks = detectNavigationLinks();
    sendResponse({ links: navLinks });
  } else if (request.action === 'startManualSelect') {
    startManualSelection();
    sendResponse({ success: true });
  }
});

function detectNavigationLinks(element: Element | Document = document) {
  // Prioritize typical sidebar/doc navigation selectors over top-level nav
  const selectors = [
    'aside',
    '.sidebar',
    '.docs-sidebar',
    '.navigation-sidebar',
    'nav[class*="sidebar"]',
    'nav[class*="menu"]',
    '.menu-content',
    '.toc',
    '#toc',
    'nav' // General nav as a fallback
  ];

  let bestNav: Element | null = null;
  let maxLinks = 0;

  for (const selector of selectors) {
    const elements = element.querySelectorAll(selector);
    for (const el of elements) {
      const linkCount = el.querySelectorAll('a').length;
      // We want the element with the most links that isn't the whole body
      if (linkCount > maxLinks && linkCount > 2) {
        maxLinks = linkCount;
        bestNav = el;
      }
    }
  }

  // Fallback: If no high-quality nav found, look for any list with many links
  if (!bestNav || maxLinks < 5) {
    const lists = element.querySelectorAll('ul, ol, div');
    for (const list of lists) {
      const linkCount = list.querySelectorAll('a').length;
      if (linkCount > maxLinks && linkCount > 5) {
        maxLinks = linkCount;
        bestNav = list;
      }
    }
  }

  if (!bestNav) return [];

  return extractLinks(bestNav);
}

function extractLinks(container: Element) {
  const links = Array.from(container.querySelectorAll('a'))
    .map(a => ({
      title: (a.innerText || a.getAttribute('aria-label') || (a as HTMLAnchorElement).href).trim(),
      url: (a as HTMLAnchorElement).href
    }))
    .filter(link => {
      try {
        if (!link.url || link.url.startsWith('javascript:')) return false;
        const url = new URL(link.url);
        // Only same origin and actual pages (not just hash fragments of current page)
        return url.origin === window.location.origin && 
               (url.pathname !== window.location.pathname || url.search !== window.location.search);
      } catch (e) {
        return false;
      }
    });

  const seen = new Set();
  return links.filter(link => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function startManualSelection() {
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div');
    hoverOverlay.style.position = 'fixed';
    hoverOverlay.style.pointerEvents = 'none';
    hoverOverlay.style.zIndex = '999999';
    hoverOverlay.style.border = '2px solid #007bff';
    hoverOverlay.style.backgroundColor = 'rgba(0, 123, 255, 0.1)';
    document.body.appendChild(hoverOverlay);
  }

  const onMouseMove = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    hoverOverlay!.style.top = `${rect.top}px`;
    hoverOverlay!.style.left = `${rect.left}px`;
    hoverOverlay!.style.width = `${rect.width}px`;
    hoverOverlay!.style.height = `${rect.height}px`;
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const target = e.target as HTMLElement;
    const links = extractLinks(target);
    
    cleanup();
    chrome.runtime.sendMessage({ action: 'manualLinksDetected', links });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cleanup();
  };

  const cleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown);
    if (hoverOverlay) {
      hoverOverlay.remove();
      hoverOverlay = null;
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
  
  alert('Haz clic en el menú/índice que quieres exportar. ESC para cancelar.');
}

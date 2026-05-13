// content.ts
let hoverOverlay: HTMLDivElement | null = null;
let instructionBanner: HTMLDivElement | null = null;

chrome.runtime.onMessage.addListener((request: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (request.action === 'detectNav') {
    autoExpandNav();
    
    setTimeout(() => {
      const navLinks = detectNavigationLinks();
      sendResponse({ links: navLinks });
    }, 150);
    return true;
  } else if (request.action === 'startManualSelect') {
    startManualSelection();
    sendResponse({ success: true });
  }
});

function autoExpandNav() {
  const toggles = document.querySelectorAll([
    '[aria-expanded="false"]',
    '.menu__list-item-collapsible > .menu__link--sublist-caret',
    '.sidebar-item-toggle',
    '.nav-item-toggle',
    '.collapsible-toggle',
    '.expand-icon'
  ].join(','));

  toggles.forEach(toggle => {
    try {
      if (toggle instanceof HTMLElement) toggle.click();
    } catch (e) {}
  });
}

function detectNavigationLinks(element: Element | Document = document) {
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
    'nav'
  ];

  let bestNav: Element | null = null;
  let maxLinks = 0;

  for (const selector of selectors) {
    const elements = element.querySelectorAll(selector);
    for (const el of elements) {
      const linkCount = el.querySelectorAll('a').length;
      if (linkCount > maxLinks && linkCount > 2) {
        maxLinks = linkCount;
        bestNav = el;
      }
    }
  }

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
    .map(a => {
      const url = (a as HTMLAnchorElement).href;
      let title = '';
      
      // Try multiple sources for the title
      title = (a.textContent || a.getAttribute('aria-label') || a.getAttribute('title') || '').trim();
      
      // If still empty or just whitespace, use the URL path
      if (!title || title.length < 2) {
        try {
          const urlObj = new URL(url);
          const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
          if (pathSegments.length > 0) {
            title = pathSegments[pathSegments.length - 1]
              .replace(/\.html?$/i, '')
              .replace(/[-_]/g, ' ')
              .replace(/\b\w/g, l => l.toUpperCase());
          }
        } catch (e) {}
      }
      
      if (!title) title = url;

      return { title, url };
    })
    .filter(link => {
      try {
        if (!link.url || link.url.startsWith('javascript:')) return false;
        const url = new URL(link.url);
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
    hoverOverlay.style.border = '3px solid #ffffff';
    hoverOverlay.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    document.body.appendChild(hoverOverlay);
  }

  if (!instructionBanner) {
    instructionBanner = document.createElement('div');
    instructionBanner.style.position = 'fixed';
    instructionBanner.style.top = '0';
    instructionBanner.style.left = '0';
    instructionBanner.style.right = '0';
    instructionBanner.style.backgroundColor = '#000000';
    instructionBanner.style.color = '#ffffff';
    instructionBanner.style.padding = '14px';
    instructionBanner.style.textAlign = 'center';
    instructionBanner.style.fontFamily = 'Courier New, Courier, monospace';
    instructionBanner.style.fontSize = '14px';
    instructionBanner.style.fontWeight = '900';
    instructionBanner.style.borderBottom = '3px solid #ffffff';
    instructionBanner.style.zIndex = '1000000';
    instructionBanner.innerText = '[SELECT_TARGET_COMPONENT] | ESC_TO_CANCEL';
    document.body.appendChild(instructionBanner);
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
    autoExpandNavInside(target);
    
    setTimeout(() => {
      const links = extractLinks(target);
      cleanup();
      chrome.runtime.sendMessage({ action: 'manualLinksDetected', links });
    }, 150);
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
    if (instructionBanner) {
      instructionBanner.remove();
      instructionBanner = null;
    }
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown);
}

function autoExpandNavInside(element: HTMLElement) {
  const toggles = element.querySelectorAll('[aria-expanded="false"], .menu__link--sublist-caret, .sidebar-item-toggle');
  toggles.forEach(toggle => {
    if (toggle instanceof HTMLElement) toggle.click();
  });
}

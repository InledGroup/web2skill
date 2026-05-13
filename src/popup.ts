import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';
import JSZip from 'jszip';

// popup.ts
const linkList = document.getElementById('link-list')!;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const manualBtn = document.getElementById('manual-btn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
const statusText = document.getElementById('status')!;
const progressContainer = document.getElementById('progress-container')!;
const progressFill = document.getElementById('progress-fill')!;
const progressLabel = document.getElementById('progress-text')!;
const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement;

let detectedLinks: { title: string; url: string }[] = [];
let abortController: AbortController | null = null;

// Theme Management
chrome.storage.local.get(['theme'], (result) => {
  if (result.theme === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.innerText = 'Terminal Mode';
  }
});

themeToggle.addEventListener('click', () => {
  const isLight = document.body.classList.toggle('light-theme');
  const theme = isLight ? 'light' : 'terminal';
  themeToggle.innerText = isLight ? 'Terminal Mode' : 'Light Mode';
  chrome.storage.local.set({ theme });
});

function initScanner() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: 'detectNav' }, (response: any) => {
        if (chrome.runtime.lastError) {
          statusText.innerHTML = 'Requirement: Please <a href="#" id="reload-link" style="color: var(--accent); text-decoration: underline;">reload the page</a> to enable scanning.';
          document.getElementById('reload-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.reload(activeTab.id!);
            window.close();
          });
          return;
        }
        handleResponse(response);
      });
    }
  });
}

initScanner();

function handleResponse(response: any) {
  if (response && response.links && response.links.length > 0) {
    detectedLinks = response.links;
    renderLinks(detectedLinks);
    statusText.innerText = `${detectedLinks.length} pages detected`;
    exportBtn.disabled = false;
  } else {
    statusText.innerText = 'No navigation index found';
  }
}

function renderLinks(links: { title: string; url: string }[]) {
  linkList.innerHTML = '';
  links.forEach((link, index) => {
    const div = document.createElement('div');
    div.className = 'link-item';
    div.innerHTML = `
      <input type="checkbox" id="link-${index}" checked data-url="${link.url}" data-title="${link.title}">
      <label for="link-${index}" title="${link.url}">${link.title}</label>
    `;
    linkList.appendChild(div);
  });
}

manualBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab?.id) {
      chrome.tabs.sendMessage(activeTab.id, { action: 'startManualSelect' });
      window.close();
    }
  });
});

chrome.storage.local.get(['manualLinks'], (result) => {
  if (result.manualLinks) {
    handleResponse({ links: result.manualLinks });
    chrome.storage.local.remove('manualLinks');
  }
});

exportBtn.addEventListener('click', async () => {
  const selectedCheckboxes = document.querySelectorAll('input[type="checkbox"]:checked') as NodeListOf<HTMLInputElement>;
  const selectedLinks = Array.from(selectedCheckboxes).map(cb => ({
    title: cb.dataset.title!,
    url: cb.dataset.url!
  }));

  if (selectedLinks.length === 0) {
    alert('Please select at least one page');
    return;
  }

  exportBtn.disabled = true;
  manualBtn.disabled = true;
  exportBtn.style.display = 'none';
  cancelBtn.style.display = 'block';
  progressContainer.style.display = 'block';
  
  abortController = new AbortController();
  
  try {
    await runExport(selectedLinks, abortController.signal);
    statusText.innerText = 'Export completed!';
    progressLabel.innerText = '100% - Success';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      statusText.innerText = 'Export cancelled by user';
      progressLabel.innerText = 'Cancelled';
    } else {
      statusText.innerText = 'Error: ' + err.message;
      progressFill.style.backgroundColor = '#ef4444';
    }
  } finally {
    exportBtn.disabled = false;
    manualBtn.disabled = false;
    exportBtn.style.display = 'block';
    cancelBtn.style.display = 'none';
    abortController = null;
  }
});

cancelBtn.addEventListener('click', () => {
  if (abortController) {
    abortController.abort();
  }
});

async function runExport(links: { title: string, url: string }[], signal: AbortSignal) {
  const zip = new JSZip();
  const turndown = new TurndownService();
  const total = links.length;
  const footer = "\n\n---\nCreated with web2skill, from [Inled Group](https://inled.es)";
  
  const urlMap: Record<string, string> = {};
  links.forEach((link, i) => {
    const filename = sanitizeFilename(link.title) || `page-${i}`;
    urlMap[link.url] = `${filename}.md`;
  });

  for (let i = 0; i < links.length; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    
    const link = links[i];
    const percent = Math.round(((i + 1) / total) * 100);
    
    updateProgress(percent, `Downloading: ${link.title}`);

    try {
      const response = await fetch(link.url, { signal });
      const html = await response.text();
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const base = new URL(link.url);
      doc.querySelectorAll('a').forEach(a => {
        try {
          const href = a.getAttribute('href');
          if (href) a.href = new URL(href, base).href;
        } catch(e) {}
      });

      const reader = new Readability(doc);
      const article = reader.parse();
      
      if (article && article.content) {
        let markdown = turndown.turndown(article.content);
        markdown = processLinks(markdown, urlMap);
        zip.file(urlMap[link.url], `# ${article.title}\n\n${markdown}${footer}`);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.error(`Failed to fetch ${link.url}`, e);
    }
  }

  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  
  updateProgress(99, 'Generating ZIP file...');
  const content = await zip.generateAsync({ type: 'blob' });
  
  const url = URL.createObjectURL(content);
  await chrome.downloads.download({
    url: url,
    filename: 'documentation.zip',
    saveAs: true
  });
  URL.revokeObjectURL(url);
}

function updateProgress(percent: number, status: string) {
  progressFill.style.width = `${percent}%`;
  progressLabel.innerText = `${percent}% - ${status}`;
  statusText.innerText = status;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 50);
}

function processLinks(markdown: string, urlMap: Record<string, string>) {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    for (const originalUrl in urlMap) {
      if (url === originalUrl || url.startsWith(originalUrl + '#') || originalUrl.startsWith(url)) {
        return `[${text}](./${urlMap[originalUrl]})`;
      }
    }
    return match;
  });
}

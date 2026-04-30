import { promises as fs } from 'fs';
import path from 'path';

type CollectOptions = {
  headed?: boolean; // Playwright UI 표시
  timeoutMs?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
};

export const WebCollector = {
  /**
   * 지정된 URL을 열고 DOM 스냅샷(JSON)을 파일로 저장한다.
   * - 기본적으로 헤드풀(headed) 모드로 실행한다.
   * - playwright 패키지가 설치되어 있어야 한다.
   */
  async collect(url: string, outPath: string, options: CollectOptions = {}) {
    const { headed = true, timeoutMs = 30000, waitUntil = 'networkidle' } = options;
    let browserType: any;
    try {
      const pw = await import('playwright');
      browserType = pw.chromium || pw.webkit || pw.firefox;
    } catch (e) {
      throw new Error(
        'playwright가 설치되어 있지 않습니다. 설치 후 다시 시도하세요: pnpm add -w playwright'
      );
    }

    const browser = await browserType.launch({
      headless: !headed,
      args: headed ? [] : ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();

      try {
        await page.goto(url, { waitUntil, timeout: timeoutMs });
      } catch (gotoError: any) {
        throw new Error(`페이지 로딩 실패: ${gotoError.message}`);
      }

      const snapshot = await page.evaluate(() => {
        function getPath(el: Element): string {
          if (el === document.body) return '/html/body';
          const parts: string[] = [];
          let node: Element | null = el;
          while (node && node !== document.body) {
            const tag = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (!parent) break;
            const siblings = Array.from(parent.children).filter(
              (c) => c.tagName.toLowerCase() === tag
            );
            const index =
              siblings.length > 1 ? `[${siblings.indexOf(node) + 1}]` : '';
            parts.unshift(`${tag}${index}`);
            node = parent;
          }
          return `/html/body/${parts.join('/')}`;
        }

        function visible(el: Element): boolean {
          const style = window.getComputedStyle(el as Element);
          const rect = (el as Element).getBoundingClientRect?.();
          const hasSize = rect ? rect.width > 0 && rect.height > 0 : true;
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            hasSize
          );
        }

        // <br> 등 줄바꿈 요소를 공백으로 치환하여 textContent를 추출
        // textContent는 BR을 무시하고 붙여버리므로(예: "10일시행일자") innerText 방식으로 추출
        function getVisualText(el: Element): string {
          const clone = el.cloneNode(true) as Element;
          clone.querySelectorAll('br').forEach(br => br.replaceWith(' '));
          return (clone.textContent || '').replace(/\s+/g, ' ').trim();
        }

        const nodes: any[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
        let current: Node | null = walker.currentNode;
        while ((current = walker.nextNode())) {
          const el = current as Element;
          const role = (el.getAttribute('role') || '').toLowerCase();
          const tag = el.tagName.toLowerCase();
          const visualText = getVisualText(el);
          const name =
            el.getAttribute('name') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('id') ||
            visualText.slice(0, 64) || undefined;

          const attrs: Record<string, string> = {};
          for (const a of Array.from(el.attributes)) {
            if (['class', 'style'].includes(a.name)) continue;
            attrs[a.name] = a.value;
          }

          nodes.push({
            role: role || undefined,
            tag,
            name: name || undefined,
            textContent: visualText || undefined,
            path: getPath(el),
            selector: getPath(el),
            visible: visible(el),
            attrs,
          });
        }

        return {
          title: document.title,
          nodes,
        };
      });

      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2), 'utf-8');

      return { url, outPath, count: snapshot.nodes?.length ?? 0 };
    } finally {
      await browser.close();
    }
  },
};


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

    const browser = await browserType.launch({ headless: !headed });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil, timeout: timeoutMs });

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

      const nodes: any[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
      let current: Node | null = walker.currentNode;
      while ((current = walker.nextNode())) {
        const el = current as Element;
        const role = (el.getAttribute('role') || '').toLowerCase();
        const tag = el.tagName.toLowerCase();
        const name =
          el.getAttribute('name') ||
          el.getAttribute('aria-label') ||
          el.getAttribute('id') ||
          el.textContent?.trim()?.slice(0, 64);

        const attrs: Record<string, string> = {};
        for (const a of Array.from(el.attributes)) {
          if (['class', 'style'].includes(a.name)) continue;
          attrs[a.name] = a.value;
        }

        nodes.push({
          role: role || undefined,
          tag,
          name: name || undefined,
          textContent: el.textContent?.trim() || undefined,
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

    await browser.close();
    return { url, outPath, count: snapshot.nodes?.length ?? 0 };
  },
};


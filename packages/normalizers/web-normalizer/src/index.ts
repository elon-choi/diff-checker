import { UUMDocument, UUMNode } from '../../../core-engine/src/types';
import { normalizeKey } from '../../spec-normalizer/src/selector-key';

type DomNode = {
  uid?: string;
  tag?: string;
  role?: string;
  name?: string;
  text?: string;
  visible?: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
  path?: string;
  children?: DomNode[];
  attrs?: Record<string, string>;
  [key: string]: any;
};

/**
 * Web DOM 노드에서 selectorKey 추출
 * data-qa, data-testid 속성을 우선적으로 사용
 */
function extractSelectorKeyFromWebNode(node: any): string | undefined {
  if (!node) return undefined;
  
  // attrs에서 data-qa 또는 data-testid 추출
  const attrs = node.attrs || {};
  const dataQa = attrs['data-qa'] || attrs['dataQa'];
  const dataTestId = attrs['data-testid'] || attrs['dataTestId'];
  
  if (dataQa) {
    return normalizeKey(dataQa);
  }
  if (dataTestId) {
    return normalizeKey(dataTestId);
  }
  
  return undefined;
}

export const WebNormalizer = {
  canHandle: (input: any) =>
    typeof input === 'string' || (typeof input === 'object' && input !== null),
  normalize: async (webDomInput: any): Promise<UUMDocument> => {
    try {
      if (!webDomInput) {
        return {
          platform: 'WEB',
          source: 'web_dom.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      let data: any;
      try {
        data = typeof webDomInput === 'string' ? JSON.parse(webDomInput) : webDomInput;
      } catch (parseError) {
        console.warn('WebNormalizer JSON 파싱 실패:', parseError);
        return {
          platform: 'WEB',
          source: 'web_dom.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      const nodes: UUMNode[] = [];

    // Case A: flat array under data.nodes (legacy/sample)
    if (Array.isArray(data?.nodes)) {
      data.nodes.forEach((n: any, i: number) => {
        const selectorKey = extractSelectorKeyFromWebNode(n);
        nodes.push({
          uid: n?.uid ?? `web-${i}`,
          platform: 'WEB',
          role: n?.role ?? 'ELEMENT',
          name: n?.tag ?? n?.name ?? 'node',
          text: n?.textContent ?? n?.text,
          selector: n?.selector ?? n?.path ?? undefined,
          visible: n?.visible ?? true,
          path: n?.path ?? `/web/${i}`,
          selectorKey, // Web DOM에서 추출한 selectorKey
          meta: { attrs: n?.attrs },
        });
      });
    } else {
      // Case B: hierarchical DOM-like tree
      const walk = (node: DomNode, path: string, index: number) => {
        const uid = node.uid ?? `web-${nodes.length}`;
        const thisPath = path || `/dom/${index}`;
        const selectorKey = extractSelectorKeyFromWebNode(node);
        nodes.push({
          uid,
          platform: 'WEB',
          role: node.role ?? node.tag ?? 'NODE',
          name: node.name ?? node.tag,
          text: node.text,
          selector: thisPath,
          visible: node.visible ?? true,
          bounds: node.bounds,
          selectorKey, // Web DOM에서 추출한 selectorKey
          meta: { attrs: node.attrs },
          path: thisPath,
        });
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((child, i) =>
            walk(child, `${thisPath}/children/${i}`, i)
          );
        }
      };
      walk(data, '', 0);
    }

      return {
        platform: 'WEB',
        source: 'web_dom.json',
        capturedAt: new Date().toISOString(),
        nodes,
      };
    } catch (error) {
      console.warn('WebNormalizer 실패, 빈 문서 반환:', error);
      return {
        platform: 'WEB',
        source: 'web_dom.json',
        capturedAt: new Date().toISOString(),
        nodes: [],
      };
    }
  },
};

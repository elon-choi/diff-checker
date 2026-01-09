import { UUMDocument, UUMNode } from '../../../core-engine/src/types';

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
  [key: string]: any;
};

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
        nodes.push({
          uid: n?.uid ?? `web-${i}`,
          platform: 'WEB',
          role: n?.role ?? 'ELEMENT',
          name: n?.tag ?? n?.name ?? 'node',
          text: n?.textContent ?? n?.text,
          selector: n?.selector ?? n?.path ?? undefined,
          visible: n?.visible ?? true,
          path: n?.path ?? `/web/${i}`,
          meta: { attrs: n?.attrs },
        });
      });
    } else {
      // Case B: hierarchical DOM-like tree
      const walk = (node: DomNode, path: string, index: number) => {
        const uid = node.uid ?? `web-${nodes.length}`;
        const thisPath = path || `/dom/${index}`;
        nodes.push({
          uid,
          platform: 'WEB',
          role: node.role ?? node.tag ?? 'NODE',
          name: node.name ?? node.tag,
          text: node.text,
          selector: thisPath,
          visible: node.visible ?? true,
          bounds: node.bounds,
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

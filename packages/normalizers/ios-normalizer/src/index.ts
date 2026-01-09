import { UUMDocument, UUMNode } from '../../../core-engine/src/types';

type IOSView = {
  id?: string;
  type?: string;
  name?: string;
  label?: string;
  value?: string;
  identifier?: string;
  visible?: boolean;
  frame?: { x: number; y: number; width: number; height: number };
  traits?: any;
  children?: IOSView[];
  [key: string]: any;
};

export const IOSNormalizer = {
  canHandle: (input: any) => typeof input === 'string' || typeof input === 'object',
  normalize: async (iosDumpInput: any): Promise<UUMDocument> => {
    try {
      if (!iosDumpInput) {
        return {
          platform: 'IOS',
          source: 'ios_dump.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      let data: any;
      try {
        data = typeof iosDumpInput === 'string' ? JSON.parse(iosDumpInput) : iosDumpInput;
      } catch (parseError) {
        console.warn('IOSNormalizer JSON 파싱 실패:', parseError);
        return {
          platform: 'IOS',
          source: 'ios_dump.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      const nodes: UUMNode[] = [];

    const toBounds = (frame?: IOSView['frame']) =>
      frame
        ? { x: frame.x ?? 0, y: frame.y ?? 0, w: frame.width ?? 0, h: frame.height ?? 0 }
        : undefined;

    const walk = (node: IOSView, path: string, index: number = 0) => {
      const uid = node.id ?? `ios-${nodes.length}`;
      nodes.push({
        uid,
        platform: 'IOS',
        role: node.type ?? 'ELEMENT',
        name: node.name ?? node.label ?? node.identifier ?? `element-${index}`,
        text: node.value ?? node.label,
        selector: node.identifier ? `#${node.identifier}` : path,
        visible: node.visible ?? true,
        bounds: toBounds(node.frame),
        meta: { traits: node.traits },
        path,
      });

      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child, i) => walk(child, `${path}/children/${i}`, i));
      }
    };

    if (data.type || (data.children && Array.isArray(data.children))) {
      walk(data, '/ios/root');
    } else {
      const elements = Array.isArray(data?.elements) ? data.elements : Array.isArray(data) ? data : [];
      if (elements.length > 0) {
        elements.forEach((el: any, i: number) => {
          nodes.push({
            uid: `ios-${i}`,
            platform: 'IOS',
            role: el?.type ?? 'ELEMENT',
            name: el?.identifier ?? el?.label ?? `element-${i}`,
            text: el?.value,
            selector: el?.path ?? `/ios/${i}`,
            visible: el?.visible ?? true,
            bounds: toBounds(el?.frame),
            path: el?.path ?? `/ios/${i}`,
            meta: { traits: el?.traits },
          });
        });
      } else {
        nodes.push({
          uid: 'ios-0',
          platform: 'IOS',
          role: 'ROOT',
          name: 'Root',
          visible: true,
          path: '/ios/0',
          meta: { keys: Object.keys(data || {}) },
        });
      }
    }

      return {
        platform: 'IOS',
        source: 'ios_dump.json',
        capturedAt: new Date().toISOString(),
        nodes,
      };
    } catch (error) {
      console.warn('IOSNormalizer 실패, 빈 문서 반환:', error);
      return {
        platform: 'IOS',
        source: 'ios_dump.json',
        capturedAt: new Date().toISOString(),
        nodes: [],
      };
    }
  },
};



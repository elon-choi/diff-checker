import { UUMDocument, UUMNode } from '../../../core-engine/src/types';

type AndroidView = {
  id?: string;
  className?: string;
  text?: string;
  contentDesc?: string;
  resourceId?: string;
  visible?: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
  children?: AndroidView[];
  [key: string]: any;
};

export const AndroidNormalizer = {
  canHandle: (input: any) => typeof input === 'string' || typeof input === 'object',
  normalize: async (androidDumpInput: any): Promise<UUMDocument> => {
    try {
      if (!androidDumpInput) {
        return {
          platform: 'ANDROID',
          source: 'android_dump.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      let data: any;
      try {
        data = typeof androidDumpInput === 'string' ? JSON.parse(androidDumpInput) : androidDumpInput;
      } catch (parseError) {
        console.warn('AndroidNormalizer JSON 파싱 실패:', parseError);
        return {
          platform: 'ANDROID',
          source: 'android_dump.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      const nodes: UUMNode[] = [];

    const walk = (node: AndroidView, path: string, index: number = 0) => {
      const uid = node.id ?? `android-${nodes.length}`;
      nodes.push({
        uid,
        platform: 'ANDROID',
        role: node.className ?? 'VIEW',
        name: node.contentDesc ?? node.id ?? `view-${index}`,
        text: node.text,
        selector: node.id ? `#${node.id}` : path,
        visible: node.visible ?? true,
        bounds: node.bounds,
        meta: { resourceId: node.resourceId, pkg: (node as any).package },
        path,
      });

      if (node.children && Array.isArray(node.children)) {
        node.children.forEach((child, i) => walk(child, `${path}/children/${i}`, i));
      }
    };

    if (data.className || (data.children && Array.isArray(data.children))) {
      walk(data, '/android/root');
    } else {
      const views = Array.isArray(data?.views) ? data.views : Array.isArray(data) ? data : [];
      if (views.length > 0) {
        views.forEach((v: any, i: number) => {
          nodes.push({
            uid: `android-${i}`,
            platform: 'ANDROID',
            role: v?.class ?? 'VIEW',
            name: v?.id ?? v?.contentDescription ?? `view-${i}`,
            text: v?.text,
            selector: v?.path ?? (v?.id ? `#${v.id}` : undefined),
            visible: v?.visible ?? true,
            bounds: v?.bounds,
            path: v?.path ?? `/android/${i}`,
            meta: { pkg: v?.package },
          });
        });
      } else {
        nodes.push({
          uid: 'android-0',
          platform: 'ANDROID',
          role: 'ROOT',
          name: 'Root',
          visible: true,
          path: '/android/0',
          meta: { keys: Object.keys(data || {}) },
        });
      }
    }

      return {
        platform: 'ANDROID',
        source: 'android_dump.json',
        capturedAt: new Date().toISOString(),
        nodes,
      };
    } catch (error) {
      console.warn('AndroidNormalizer 실패, 빈 문서 반환:', error);
      return {
        platform: 'ANDROID',
        source: 'android_dump.json',
        capturedAt: new Date().toISOString(),
        nodes: [],
      };
    }
  },
};



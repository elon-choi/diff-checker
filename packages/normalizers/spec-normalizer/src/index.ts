import { Normalizer } from '../types';
import { UUMDocument, UUMNode } from '../../../core-engine/src/types';

export const SpecNormalizer: Normalizer = {
  canHandle: (input: any) => typeof input === 'string',
  normalize: async (specText: string): Promise<UUMDocument> => {
    try {
      if (!specText || typeof specText !== 'string') {
        return {
          platform: 'SPEC',
          source: 'spec.md',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      const lines = specText.split('\n').filter(Boolean);

      const nodes: UUMNode[] = lines.map((line, idx) => ({
        uid: `spec-${idx}`,
        platform: 'SPEC',
        text: line.trim(),
        role: 'TEXT',
        selector: `/spec/${idx}`,
        visible: true,
        path: `/spec/${idx}`,
      }));

      return {
        platform: 'SPEC',
        source: 'spec.md',
        capturedAt: new Date().toISOString(),
        nodes,
      };
    } catch (error) {
      console.warn('SpecNormalizer 실패, 빈 문서 반환:', error);
      return {
        platform: 'SPEC',
        source: 'spec.md',
        capturedAt: new Date().toISOString(),
        nodes: [],
      };
    }
  },
};

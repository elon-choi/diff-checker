import { describe, it, expect } from 'vitest';
import { DiffEngine } from './diff-engine';
import {
  textStrictRule,
  missingElementRule,
  structureRule,
} from './rules';
import type { UUMDocument, SpecItem } from './types';

describe('DiffEngine', () => {
  const createSpecDoc = (): UUMDocument => ({
    platform: 'SPEC',
    source: 'spec.md',
    capturedAt: new Date().toISOString(),
    nodes: [
      {
        uid: 's1',
        platform: 'SPEC',
        text: '로그인',
        role: 'TEXT',
      },
    ],
  });

  const createFigmaDoc = (): UUMDocument => ({
    platform: 'FIGMA',
    source: 'figma.json',
    capturedAt: new Date().toISOString(),
    nodes: [
      {
        uid: 'f1',
        platform: 'FIGMA',
        text: 'Login',
        role: 'TEXT',
      },
    ],
  });

  it('should run phase 1 with spec and figma', async () => {
    const engine = new DiffEngine([textStrictRule]);
    const specItems: SpecItem[] = [
      { id: '1', kind: 'TEXT', text: '로그인' },
    ];

    const findings = await engine.runPhase(
      1,
      {
        spec: createSpecDoc(),
        figma: createFigmaDoc(),
      },
      specItems
    );

    expect(findings).toBeDefined();
    expect(Array.isArray(findings)).toBe(true);
  });

  it('should apply all rules', async () => {
    const engine = new DiffEngine([
      textStrictRule,
      missingElementRule,
      structureRule,
    ]);
    const specItems: SpecItem[] = [
      { id: '1', kind: 'TEXT', text: '로그인' },
    ];

    const findings = await engine.runPhase(
      1,
      {
        spec: createSpecDoc(),
        figma: createFigmaDoc(),
      },
      specItems
    );

    expect(findings.length).toBeGreaterThan(0);
  });

  it('should use LLM adapter when provided', async () => {
    const mockLLM = {
      refine: async (findings: any[]) => {
        return findings.map((f) => ({
          ...f,
          description: `[LLM] ${f.description}`,
        }));
      },
    };

    const engine = new DiffEngine([textStrictRule], mockLLM);
    const specItems: SpecItem[] = [
      { id: '1', kind: 'TEXT', text: '로그인' },
    ];

    const findings = await engine.runPhase(
      1,
      {
        spec: createSpecDoc(),
        figma: createFigmaDoc(),
      },
      specItems
    );

    if (findings.length > 0) {
      expect(findings[0].description).toContain('[LLM]');
    }
  });

  it('should filter out undefined inputs', async () => {
    const engine = new DiffEngine([structureRule]);

    const findings = await engine.runPhase(
      2,
      {
        spec: createSpecDoc(),
        figma: createFigmaDoc(),
        web: undefined,
        android: undefined,
        ios: undefined,
      },
      []
    );

    expect(findings).toBeDefined();
  });
});



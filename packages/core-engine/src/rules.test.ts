import { describe, it, expect } from 'vitest';
import {
  textStrictRule,
  missingElementRule,
  visibilityRule,
  policyRule,
  structureRule,
} from './rules';
import type { UUMDocument, SpecItem } from './types';

describe('Diff Rules', () => {
  const createSpecDoc = (nodes: any[]): UUMDocument => ({
    platform: 'SPEC',
    source: 'spec.md',
    capturedAt: new Date().toISOString(),
    nodes,
  });

  const createFigmaDoc = (nodes: any[]): UUMDocument => ({
    platform: 'FIGMA',
    source: 'figma.json',
    capturedAt: new Date().toISOString(),
    nodes,
  });

  const createWebDoc = (nodes: any[]): UUMDocument => ({
    platform: 'WEB',
    source: 'web_dom.json',
    capturedAt: new Date().toISOString(),
    nodes,
  });

  describe('textStrictRule', () => {
    it('should find text mismatch when spec text is missing', () => {
      const specItems: SpecItem[] = [
        { id: '1', kind: 'TEXT', text: '로그인' },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인' }]),
        createFigmaDoc([{ uid: 'f1', platform: 'FIGMA', text: 'Login' }]),
      ];

      const findings = textStrictRule.apply(docs, specItems);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('TEXT_MISMATCH');
    });

    it('should not find mismatch when text matches', () => {
      const specItems: SpecItem[] = [
        { id: '1', kind: 'TEXT', text: '로그인' },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인' }]),
        createFigmaDoc([{ uid: 'f1', platform: 'FIGMA', text: '로그인' }]),
      ];

      const findings = textStrictRule.apply(docs, specItems);

      const mismatchFindings = findings.filter(
        (f) => f.category === 'TEXT_MISMATCH' && f.relatedSpecId === '1'
      );
      expect(mismatchFindings.length).toBe(0);
    });

    it('should match by selector when provided', () => {
      const specItems: SpecItem[] = [
        { id: '1', kind: 'TEXT', text: '로그인', selector: '#login-btn' },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인' }]),
        createWebDoc([
          {
            uid: 'w1',
            platform: 'WEB',
            selector: '#login-btn',
            text: '로그인',
          },
        ]),
      ];

      const findings = textStrictRule.apply(docs, specItems);

      const mismatchFindings = findings.filter(
        (f) => f.category === 'TEXT_MISMATCH' && f.relatedSpecId === '1'
      );
      expect(mismatchFindings.length).toBe(0);
    });
  });

  describe('missingElementRule', () => {
    it('should find missing element when required element is not present', () => {
      const specItems: SpecItem[] = [
        {
          id: '1',
          kind: 'STATE',
          visibility: 'show',
          text: '로그인 버튼',
        },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인 버튼' }]),
        createFigmaDoc([{ uid: 'f1', platform: 'FIGMA', text: 'Title' }]),
      ];

      const findings = missingElementRule.apply(docs, specItems);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('MISSING_ELEMENT');
      expect(findings[0].severity).toBe('CRITICAL');
    });

    it('should not find missing element when element exists', () => {
      const specItems: SpecItem[] = [
        {
          id: '1',
          kind: 'STATE',
          visibility: 'show',
          text: '로그인',
        },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인' }]),
        createFigmaDoc([
          { uid: 'f1', platform: 'FIGMA', text: '로그인', name: 'Button' },
        ]),
      ];

      const findings = missingElementRule.apply(docs, specItems);

      const missingFindings = findings.filter(
        (f) => f.category === 'MISSING_ELEMENT' && f.relatedSpecId === '1'
      );
      expect(missingFindings.length).toBe(0);
    });
  });

  describe('visibilityRule', () => {
    it('should find visibility issue when element should be visible but is not', () => {
      const specItems: SpecItem[] = [
        {
          id: '1',
          kind: 'STATE',
          visibility: 'show',
          text: '로그인 버튼',
        },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인 버튼' }]),
        createWebDoc([
          {
            uid: 'w1',
            platform: 'WEB',
            text: '로그인',
            visible: false,
          },
        ]),
      ];

      const findings = visibilityRule.apply(docs, specItems);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('VISIBILITY');
    });

    it('should not find issue when visibility matches requirement', () => {
      const specItems: SpecItem[] = [
        {
          id: '1',
          kind: 'STATE',
          visibility: 'show',
          text: '로그인',
        },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC', text: '로그인' }]),
        createWebDoc([
          {
            uid: 'w1',
            platform: 'WEB',
            text: '로그인',
            visible: true,
          },
        ]),
      ];

      const findings = visibilityRule.apply(docs, specItems);

      const visFindings = findings.filter(
        (f) => f.category === 'VISIBILITY' && f.relatedSpecId === '1'
      );
      expect(visFindings.length).toBe(0);
    });
  });

  describe('policyRule', () => {
    it('should find policy-related keywords', () => {
      const specItems: SpecItem[] = [
        { id: '1', kind: 'POLICY', text: '성인 등급은 이용이 제한됩니다' },
      ];

      const docs: UUMDocument[] = [
        createSpecDoc([
          { uid: 's1', platform: 'SPEC', text: '성인 등급은 이용이 제한됩니다' },
        ]),
        createFigmaDoc([{ uid: 'f1', platform: 'FIGMA', text: 'Title' }]),
      ];

      const findings = policyRule.apply(docs, specItems);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('POLICY');
    });
  });

  describe('structureRule', () => {
    it('should find empty document', () => {
      const docs: UUMDocument[] = [
        createSpecDoc([]),
        createFigmaDoc([{ uid: 'f1', platform: 'FIGMA' }]),
      ];

      const findings = structureRule.apply(docs, []);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].category).toBe('STRUCTURE');
      expect(findings[0].severity).toBe('INFO');
    });

    it('should not find issue when document has nodes', () => {
      const docs: UUMDocument[] = [
        createSpecDoc([{ uid: 's1', platform: 'SPEC' }]),
        createFigmaDoc([{ uid: 'f1', platform: 'FIGMA' }]),
      ];

      const findings = structureRule.apply(docs, []);

      const emptyFindings = findings.filter(
        (f) => f.category === 'STRUCTURE' && f.description.includes('비어있음')
      );
      expect(emptyFindings.length).toBe(0);
    });
  });
});



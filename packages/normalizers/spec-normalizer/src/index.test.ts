import { describe, it, expect } from 'vitest';
import { SpecNormalizer } from './index';
import type { UUMDocument } from '../../../core-engine/src/types';

describe('SpecNormalizer', () => {
  it('should normalize spec markdown text', async () => {
    const specText = `로그인 버튼의 텍스트는 "로그인" 이다.
아이디 입력창이 노출되어야 한다.`;

    const result = await SpecNormalizer.normalize(specText);

    expect(result).toMatchObject({
      platform: 'SPEC',
      source: 'spec.md',
      nodes: expect.arrayContaining([
        expect.objectContaining({
          platform: 'SPEC',
          role: 'TEXT',
          text: '로그인 버튼의 텍스트는 "로그인" 이다.',
        }),
        expect.objectContaining({
          platform: 'SPEC',
          role: 'TEXT',
          text: '아이디 입력창이 노출되어야 한다.',
        }),
      ]),
    });
  });

  it('should handle empty spec text', async () => {
    const result = await SpecNormalizer.normalize('');

    expect(result).toMatchObject({
      platform: 'SPEC',
      nodes: [],
    });
  });

  it('should filter out empty lines', async () => {
    const specText = `첫 번째 줄

세 번째 줄`;

    const result = await SpecNormalizer.normalize(specText);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].text).toBe('첫 번째 줄');
    expect(result.nodes[1].text).toBe('세 번째 줄');
  });

  it('should generate unique uids', async () => {
    const specText = `줄 1
줄 2
줄 3`;

    const result = await SpecNormalizer.normalize(specText);

    const uids = result.nodes.map((n) => n.uid);
    const uniqueUids = new Set(uids);
    expect(uniqueUids.size).toBe(uids.length);
  });
});



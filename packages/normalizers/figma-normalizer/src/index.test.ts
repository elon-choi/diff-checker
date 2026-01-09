import { describe, it, expect } from 'vitest';
import { FigmaNormalizer } from './index';
import type { UUMDocument } from '../../../core-engine/src/types';

describe('FigmaNormalizer', () => {
  it('should normalize figma JSON with document structure', async () => {
    const figmaJson = {
      document: {
        id: '0:0',
        name: 'Login Screen',
        type: 'FRAME',
        visible: true,
        children: [
          {
            id: '1:1',
            type: 'TEXT',
            name: 'Title',
            characters: '로그인',
            visible: true,
          },
        ],
      },
    };

    const result = await FigmaNormalizer.normalize(figmaJson);

    expect(result).toMatchObject({
      platform: 'FIGMA',
      source: 'figma.json',
      nodes: expect.arrayContaining([
        // TEXT 노드만 추출됨 (FRAME은 제외)
        expect.objectContaining({
          platform: 'FIGMA',
          role: 'TEXT', // TEXT 노드만 추출하므로 role이 TEXT로 고정
          text: '로그인', // characters만 사용
        }),
      ]),
    });
    // FRAME 노드는 추출되지 않음
    expect(result.nodes.length).toBe(1);
  });

  it('should handle string input', async () => {
    const figmaJsonString = JSON.stringify({
      document: {
        type: 'FRAME',
        name: 'Test',
        children: [
          {
            type: 'TEXT',
            characters: 'Test Text',
            visible: true,
          },
        ],
      },
    });

    const result = await FigmaNormalizer.normalize(figmaJsonString);

    expect(result.platform).toBe('FIGMA');
    // TEXT 노드만 추출되므로 1개
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].text).toBe('Test Text');
  });

  it('should extract bounds from absoluteBoundingBox', async () => {
    const figmaJson = {
      document: {
        type: 'FRAME',
        children: [
          {
            type: 'TEXT',
            characters: 'Button Label', // "Test" 대신 실제 UI 텍스트로 변경
            visible: true,
            absoluteBoundingBox: {
              x: 10,
              y: 20,
              width: 100,
              height: 200,
            },
          },
        ],
      },
    };

    const result = await FigmaNormalizer.normalize(figmaJson);

    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].bounds).toEqual({
      x: 10,
      y: 20,
      w: 100,
      h: 200,
    });
  });

  it('should handle nested children', async () => {
    const figmaJson = {
      document: {
        type: 'FRAME',
        children: [
          {
            type: 'GROUP',
            children: [
              {
                type: 'TEXT',
                characters: 'Nested',
                visible: true,
              },
            ],
          },
        ],
      },
    };

    const result = await FigmaNormalizer.normalize(figmaJson);

    // TEXT 노드만 추출되므로 1개
    expect(result.nodes.length).toBe(1);
    const textNode = result.nodes.find((n) => n.text === 'Nested');
    expect(textNode).toBeDefined();
    expect(textNode?.role).toBe('TEXT');
  });

  it('should exclude invisible nodes', async () => {
    const figmaJson = {
      document: {
        type: 'FRAME',
        children: [
          {
            type: 'TEXT',
            characters: 'Visible',
            visible: true,
          },
          {
            type: 'TEXT',
            characters: 'Hidden',
            visible: false,
          },
        ],
      },
    };

    const result = await FigmaNormalizer.normalize(figmaJson);

    // visible이 true인 노드만 추출되므로 1개
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].text).toBe('Visible');
  });

  it('should exclude designer guide texts', async () => {
    const figmaJson = {
      document: {
        type: 'FRAME',
        children: [
          {
            type: 'TEXT',
            characters: '583 * 300', // 해상도 설명
            visible: true,
          },
          {
            type: 'TEXT',
            characters: '텍스트 크기 30/36', // 폰트 가이드
            visible: true,
          },
          {
            type: 'TEXT',
            characters: 'Copy 가능', // 디자이너 작업 가이드
            visible: true,
          },
          {
            type: 'TEXT',
            characters: '일이삼사오육칠팔구십', // 샘플 텍스트
            visible: true,
          },
          {
            type: 'TEXT',
            characters: '26.01.05 update', // 날짜/버전 메모
            visible: true,
          },
          {
            type: 'TEXT',
            characters: 'Frame', // 구조/레이어 명칭
            visible: true,
          },
          {
            type: 'TEXT',
            characters: '실제 UI 텍스트', // 실제 UI 텍스트 (포함되어야 함)
            visible: true,
          },
        ],
      },
    };

    const result = await FigmaNormalizer.normalize(figmaJson);

    // 디자이너 가이드 텍스트는 제외되고, 실제 UI 텍스트만 포함되어야 함
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].text).toBe('실제 UI 텍스트');
  });

  it('should handle Content array format from Plugin', async () => {
    const pluginJson = [
      { Content: '필터' },
      { Content: '정렬 선택' },
      { Content: '확인' },
    ];

    const result = await FigmaNormalizer.normalize(pluginJson);

    expect(result.platform).toBe('FIGMA');
    expect(result.nodes.length).toBe(3);
    expect(result.nodes[0].text).toBe('필터');
    expect(result.nodes[1].text).toBe('정렬 선택');
    expect(result.nodes[2].text).toBe('확인');
    expect(result.nodes[0].meta?.source).toBe('plugin-export');
  });

  it('should filter designer guide texts from Content array', async () => {
    const pluginJson = [
      { Content: '필터' },
      { Content: 'test' }, // 디자이너 가이드 텍스트 (정확히 일치)
      { Content: 'Test Text' }, // 실제 UI 텍스트 (포함되어야 함)
      { Content: 'Frame' }, // 구조 이름 (필터링)
    ];

    const result = await FigmaNormalizer.normalize(pluginJson);

    expect(result.platform).toBe('FIGMA');
    // 'test', 'Frame'은 필터링되고, '필터', 'Test Text'만 남음
    expect(result.nodes.length).toBe(2);
    expect(result.nodes.map(n => n.text)).toEqual(['필터', 'Test Text']);
  });
});

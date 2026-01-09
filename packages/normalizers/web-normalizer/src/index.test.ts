import { describe, it, expect } from 'vitest';
import { WebNormalizer } from './index';
import type { UUMDocument } from '../../../core-engine/src/types';

describe('WebNormalizer', () => {
  it('should normalize web DOM JSON with nodes array', async () => {
    const webJson = {
      nodes: [
        {
          role: 'textbox',
          tag: 'input',
          name: 'id',
          path: '/html/body/main/input[1]',
          visible: true,
        },
        {
          role: 'button',
          tag: 'button',
          text: '로그인',
          path: '/html/body/main/button[1]',
          visible: true,
        },
      ],
    };

    const result = await WebNormalizer.normalize(webJson);

    expect(result).toMatchObject({
      platform: 'WEB',
      source: 'web_dom.json',
      nodes: expect.arrayContaining([
        expect.objectContaining({
          platform: 'WEB',
          role: 'textbox',
          path: '/html/body/main/input[1]',
        }),
        expect.objectContaining({
          platform: 'WEB',
          role: 'button',
          text: '로그인',
        }),
      ]),
    });
  });

  it('should handle hierarchical DOM structure', async () => {
    const webJson = {
      role: 'div',
      tag: 'div',
      children: [
        {
          role: 'button',
          tag: 'button',
          text: 'Click',
        },
      ],
    };

    const result = await WebNormalizer.normalize(webJson);

    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    const buttonNode = result.nodes.find((n) => n.text === 'Click');
    expect(buttonNode).toBeDefined();
  });

  it('should handle string input', async () => {
    const webJsonString = JSON.stringify({
      nodes: [{ role: 'button', text: 'Test' }],
    });

    const result = await WebNormalizer.normalize(webJsonString);

    expect(result.platform).toBe('WEB');
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it('should preserve selector and path', async () => {
    const webJson = {
      nodes: [
        {
          role: 'button',
          selector: '#login-btn',
          path: '/html/body/button[1]',
        },
      ],
    };

    const result = await WebNormalizer.normalize(webJson);

    expect(result.nodes[0].selector).toBe('#login-btn');
    expect(result.nodes[0].path).toBe('/html/body/button[1]');
  });
});


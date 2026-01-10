import { Normalizer } from '../types';
import { UUMDocument, UUMNode } from '../../../core-engine/src/types';

// 업데이트 날짜 패턴: "Update date: 25.12.10", "업데이트: 25.12.10", "(Update date: 25.12.10)" 등
const UPDATE_DATE_PATTERNS = [
  /\(?\s*Update\s+date\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*업데이트\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*Update\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*(\d{2}\.\d{2}\.\d{2})\s*update\s*\)?/i,
];

// 취소선 패턴: ~~텍스트~~ 또는 <del>텍스트</del>
const STRIKETHROUGH_PATTERN = /~~([^~]+)~~|<del>([^<]+)<\/del>/g;

interface ParsedLine {
  text: string;
  isDeprecated: boolean;
  isUpdated: boolean;
  updateDate?: string;
  originalText: string;
}

function parseLine(line: string): ParsedLine {
  const originalText = line.trim();
  let text = originalText;
  let isDeprecated = false;
  let isUpdated = false;
  let updateDate: string | undefined;

  // 취소선 처리: ~~텍스트~~ 제거하고 플래그 설정
  const strikethroughMatch = text.match(STRIKETHROUGH_PATTERN);
  if (strikethroughMatch) {
    isDeprecated = true;
    // 취소선 제거하고 내부 텍스트만 추출
    text = text.replace(STRIKETHROUGH_PATTERN, (match, p1, p2) => {
      return p1 || p2 || '';
    }).trim();
  }

  // 업데이트 날짜 패턴 검색
  for (const pattern of UPDATE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      isUpdated = true;
      updateDate = match[1] || match[0];
      // 업데이트 날짜 라벨 제거 (선택적)
      // text = text.replace(pattern, '').trim();
      break;
    }
  }

  // 줄 전체가 업데이트 날짜 라벨인 경우도 감지
  if (!isUpdated) {
    for (const pattern of UPDATE_DATE_PATTERNS) {
      if (pattern.test(text)) {
        isUpdated = true;
        const match = text.match(pattern);
        if (match) {
          updateDate = match[1] || match[0];
        }
        break;
      }
    }
  }

  return {
    text,
    isDeprecated,
    isUpdated,
    updateDate,
    originalText,
  };
}

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

      const nodes: UUMNode[] = lines.map((line, idx) => {
        const parsed = parseLine(line);
        
        return {
          uid: `spec-${idx}`,
          platform: 'SPEC',
          text: parsed.text,
          role: 'TEXT',
          selector: `/spec/${idx}`,
          visible: true,
          path: `/spec/${idx}`,
          meta: {
            originalText: parsed.originalText,
            isDeprecated: parsed.isDeprecated,
            isUpdated: parsed.isUpdated,
            updateDate: parsed.updateDate,
          },
        };
      });

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

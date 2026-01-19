# Diff Checker False Positive 문제 해결 설계 문서

## 작업 정보
- **작업명**: Diff Checker False Positive 문제 해결
- **설계 일시**: 2025-01-05
- **설계자**: Agent 2 (코드 설계 전문가)
- **참조 문서**: `docs/agents/agent-1-requirements/analysis-results/diff-checker-false-positive-analysis.md`

---

## 1. 개요

### 1.1 목표
- False Positive를 14,778건에서 수십 건 이내로 감소
- QA가 결과를 보고 즉시 "이건 무시" / "이건 확인 필요"를 구분할 수 있도록 개선
- 프로젝트 헌장 준수 (Diff 결과가 많을수록 좋다고 판단하지 않음)

### 1.2 핵심 요구사항
1. **REQ-1**: SpecNormalizer 필터링 강화 (High Priority)
2. **REQ-2**: FigmaNormalizer 필터링 패턴 확장 (Medium Priority)
3. **REQ-3**: reverseComparisonRule 매칭 정확도 향상 (Medium Priority)
4. **REQ-4**: 노이즈 필터링 통합 및 강화 (Medium Priority)

---

## 2. 코드 구조 설계

### 2.1 전체 아키텍처

```
packages/
├── core-engine/
│   └── src/
│       ├── filters.ts          [신규] 공통 필터링 규칙 모듈
│       └── rules.ts            [수정] reverseComparisonRule 개선
├── normalizers/
│   ├── spec-normalizer/
│   │   └── src/
│   │       ├── index.ts        [수정] 필터링 로직 통합
│   │       └── filters.ts      [신규] Spec 전용 필터링
│   └── figma-normalizer/
│       └── src/
│           └── index.ts        [수정] 필터링 패턴 확장
└── ...
```

### 2.2 설계 원칙

1. **단일 책임 원칙**: 각 Normalizer는 자신의 플랫폼에 특화된 필터링 수행
2. **DRY 원칙**: 공통 필터링 로직은 `core-engine/filters.ts`에 중앙 관리
3. **확장성**: 새로운 필터링 규칙 추가가 용이하도록 인터페이스 기반 설계
4. **하위 호환성**: 기존 API 시그니처 유지

---

## 3. 인터페이스 및 타입 정의

### 3.1 공통 필터링 인터페이스

```typescript
// packages/core-engine/src/filters.ts

/**
 * 필터링 결과
 */
export interface FilterResult {
  /** 필터링 통과 여부 */
  passed: boolean;
  /** 필터링된 이유 (디버깅용) */
  reason?: string;
}

/**
 * 텍스트 필터 인터페이스
 */
export interface TextFilter {
  /** 필터 이름 (디버깅/로깅용) */
  name: string;
  /** 필터링 수행 */
  filter(text: string, context?: FilterContext): FilterResult;
}

/**
 * 필터링 컨텍스트
 */
export interface FilterContext {
  /** 플랫폼 타입 */
  platform?: 'SPEC' | 'FIGMA' | 'WEB' | 'ANDROID' | 'IOS';
  /** 노드 메타데이터 */
  meta?: Record<string, any>;
  /** 텍스트 크기 (Figma용) */
  bounds?: { width: number; height: number };
}

/**
 * 필터 체인
 */
export class FilterChain {
  private filters: TextFilter[] = [];

  add(filter: TextFilter): FilterChain;
  filter(text: string, context?: FilterContext): FilterResult;
  filterAll(texts: string[], context?: FilterContext): string[];
}
```

### 3.2 SpecNormalizer 필터링 타입

```typescript
// packages/normalizers/spec-normalizer/src/filters.ts

/**
 * Spec 텍스트 필터링 옵션
 */
export interface SpecFilterOptions {
  /** 메타데이터 필터링 활성화 */
  filterMetadata?: boolean;
  /** 설명 텍스트 필터링 활성화 */
  filterDescriptions?: boolean;
  /** 최소 텍스트 길이 */
  minLength?: number;
  /** 최대 텍스트 길이 (설명 텍스트로 간주) */
  maxLength?: number;
  /** UI 키워드 필터링 활성화 */
  requireUIKeywords?: boolean;
}

/**
 * Spec 라인 파싱 결과
 */
export interface ParsedSpecLine {
  /** 원본 텍스트 */
  originalText: string;
  /** 처리된 텍스트 */
  text: string;
  /** 취소선 여부 */
  isDeprecated: boolean;
  /** 업데이트 여부 */
  isUpdated: boolean;
  /** 업데이트 날짜 */
  updateDate?: string;
  /** 메타데이터 여부 */
  isMetadata: boolean;
  /** 설명 텍스트 여부 */
  isDescription: boolean;
}
```

### 3.3 SpecNormalizer 인터페이스 확장

```typescript
// packages/normalizers/spec-normalizer/src/index.ts

import { Normalizer } from '../types';
import { UUMDocument, UUMNode } from '../../../core-engine/src/types';
import { SpecFilterOptions } from './filters';

export interface SpecNormalizerOptions {
  /** 필터링 옵션 */
  filterOptions?: SpecFilterOptions;
  /** 필터링 활성화 여부 (기본값: true) */
  enableFiltering?: boolean;
}

export const SpecNormalizer: Normalizer = {
  canHandle: (input: any) => typeof input === 'string',
  normalize: async (
    specText: string,
    options?: SpecNormalizerOptions
  ): Promise<UUMDocument> => {
    // 구현 내용은 아래 구현 가이드라인 참조
  },
};
```

---

## 4. 구현 가이드라인

### 4.1 Phase 1: 공통 필터링 모듈 생성 (REQ-4)

**단계 1-1: `packages/core-engine/src/filters.ts` 생성**

```typescript
// packages/core-engine/src/filters.ts

import type { FilterResult, TextFilter, FilterContext, FilterChain } from './filters';

/**
 * 기본 텍스트 필터들
 */
export const commonFilters: TextFilter[] = [
  // 빈 텍스트 필터
  {
    name: 'empty-text',
    filter: (text: string) => ({
      passed: text.trim().length >= 2,
      reason: text.trim().length < 2 ? '텍스트가 너무 짧음' : undefined,
    }),
  },
  
  // 숫자만 있는 텍스트 필터
  {
    name: 'numeric-only',
    filter: (text: string) => ({
      passed: !/^\d+$/.test(text.trim()),
      reason: /^\d+$/.test(text.trim()) ? '숫자만 포함' : undefined,
    }),
  },
  
  // 특수 문자만 있는 텍스트 필터
  {
    name: 'special-chars-only',
    filter: (text: string) => {
      const trimmed = text.trim();
      const isSpecialOnly = trimmed.length <= 2 && 
        /^[·•\-\.,;:!?()\[\]{}'"`~@#$%^&*+=|\\/<>_]+$/.test(trimmed);
      return {
        passed: !isSpecialOnly,
        reason: isSpecialOnly ? '특수 문자만 포함' : undefined,
      };
    },
  },
  
  // Footer/Policy 관련 고정 문구 필터
  {
    name: 'footer-policy',
    filter: (text: string) => {
      const lower = text.trim().toLowerCase();
      const footerKeywords = [
        '고객센터', '이용약관', '개인정보처리방침', '개인정보',
        '사업자 정보', '고객 지원',
        'customer service', 'privacy policy', 'terms of service',
        'footer', 'policy',
      ];
      const matched = footerKeywords.some(keyword => lower.includes(keyword));
      return {
        passed: !matched,
        reason: matched ? 'Footer/Policy 고정 문구' : undefined,
      };
    },
  },
  
  // 번역키 패턴 필터
  {
    name: 'translation-key',
    filter: (text: string) => {
      const trimmed = text.trim();
      const isTranslationKey = /^[a-z0-9_]+$/.test(trimmed) && 
        (trimmed.match(/_/g) || []).length >= 2 && 
        trimmed.length >= 10;
      return {
        passed: !isTranslationKey,
        reason: isTranslationKey ? '번역키 패턴' : undefined,
      };
    },
  },
];

/**
 * 공통 필터 체인 생성
 */
export function createCommonFilterChain(): FilterChain {
  // FilterChain 구현
}
```

**단계 1-2: FilterChain 클래스 구현**

```typescript
export class FilterChain {
  private filters: TextFilter[] = [];

  add(filter: TextFilter): FilterChain {
    this.filters.push(filter);
    return this;
  }

  filter(text: string, context?: FilterContext): FilterResult {
    for (const filter of this.filters) {
      const result = filter.filter(text, context);
      if (!result.passed) {
        return result;
      }
    }
    return { passed: true };
  }

  filterAll(texts: string[], context?: FilterContext): string[] {
    return texts.filter(text => this.filter(text, context).passed);
  }
}
```

### 4.2 Phase 2: SpecNormalizer 필터링 통합 (REQ-1)

**단계 2-1: `packages/normalizers/spec-normalizer/src/filters.ts` 생성**

```typescript
// packages/normalizers/spec-normalizer/src/filters.ts

import { FilterResult, FilterContext } from '../../../core-engine/src/filters';
import { ParsedSpecLine, SpecFilterOptions } from './types';

/**
 * 메타데이터 패턴 검사
 */
export function isMetadata(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  
  // 업데이트 날짜 패턴
  const updateDatePatterns = [
    /\(?\s*Update\s+date\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
    /\(?\s*업데이트\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
    /\(?\s*Update\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
    /\(?\s*(\d{2}\.\d{2}\.\d{2})\s*update\s*\)?/i,
  ];
  
  if (updateDatePatterns.some(pattern => pattern.test(normalized))) {
    return true;
  }
  
  // 해상도/사이즈 설명
  if (/^\d+\s*[*x×]\s*\d+$/.test(normalized) || /^\d+-\d+$/.test(normalized)) {
    return true;
  }
  
  // 해상도 라벨 (예: "320px", "모바일", "태블릿")
  if (/^\d+px$/.test(normalized) || 
      /^(모바일|태블릿|데스크톱|mobile|tablet|desktop)$/.test(normalized)) {
    return true;
  }
  
  // 상태 라벨 (예: "기본", "호버", "활성")
  if (/^(기본|호버|활성|비활성|disabled|hover|active|default)$/.test(normalized)) {
    return true;
  }
  
  // 헤더 패턴 (#으로 시작)
  if (/^#+\s/.test(text.trim())) {
    return true;
  }
  
  return false;
}

/**
 * 설명 텍스트 여부 검사
 */
export function isDescription(
  text: string, 
  options: SpecFilterOptions = {}
): boolean {
  const maxLength = options.maxLength ?? 50;
  const minLength = options.minLength ?? 2;
  
  // 너무 긴 텍스트는 설명으로 간주
  if (text.length > maxLength) {
    // UI 키워드가 있으면 설명이 아닐 수 있음
    if (options.requireUIKeywords) {
      const uiKeywords = [
        '버튼', '라벨', '텍스트', '옵션', '선택', '필터', 
        '정렬', '뷰', '화면', '팝업', '모달', '클릭', '노출'
      ];
      const hasUIKeyword = uiKeywords.some(keyword => text.includes(keyword));
      return !hasUIKeyword;
    }
    return true;
  }
  
  // 너무 짧은 텍스트는 제외
  if (text.length < minLength) {
    return true;
  }
  
  return false;
}

/**
 * Spec 라인 파싱
 */
export function parseSpecLine(
  line: string,
  latestSpecYear?: number
): ParsedSpecLine {
  const originalText = line.trim();
  let text = originalText;
  let isDeprecated = false;
  let isUpdated = false;
  let updateDate: string | undefined;
  
  // 취소선 처리
  const strikethroughPattern = /~~([^~]+)~~|<del>([^<]+)<\/del>/g;
  const strikethroughMatch = text.match(strikethroughPattern);
  if (strikethroughMatch) {
    isDeprecated = true;
    text = text.replace(strikethroughPattern, (match, p1, p2) => {
      return p1 || p2 || '';
    }).trim();
  }
  
  // 업데이트 날짜 패턴 검색
  const updateDatePatterns = [
    /\(?\s*Update\s+date\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
    /\(?\s*업데이트\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
    /\(?\s*Update\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
    /\(?\s*(\d{2}\.\d{2}\.\d{2})\s*update\s*\)?/i,
  ];
  
  for (const pattern of updateDatePatterns) {
    const match = text.match(pattern);
    if (match) {
      isUpdated = true;
      updateDate = match[1] || match[0];
      break;
    }
  }
  
  // 메타데이터 여부 검사
  const isMetadataFlag = isMetadata(text);
  
  // 설명 텍스트 여부 검사
  const isDescriptionFlag = isDescription(text, {
    maxLength: 50,
    requireUIKeywords: true,
  });
  
  return {
    originalText,
    text,
    isDeprecated,
    isUpdated,
    updateDate,
    isMetadata: isMetadataFlag,
    isDescription: isDescriptionFlag,
  };
}

/**
 * Spec 텍스트 필터링
 */
export function filterSpecText(
  parsedLine: ParsedSpecLine,
  options: SpecFilterOptions = {}
): boolean {
  // 취소선 처리된 항목 제외
  if (parsedLine.isDeprecated) {
    return false;
  }
  
  // 업데이트 날짜만 있고 내용이 없는 라인 제외
  if (parsedLine.isUpdated && !parsedLine.text.trim()) {
    return false;
  }
  
  // 메타데이터 필터링
  if (options.filterMetadata !== false && parsedLine.isMetadata) {
    return false;
  }
  
  // 설명 텍스트 필터링
  if (options.filterDescriptions !== false && parsedLine.isDescription) {
    return false;
  }
  
  return true;
}
```

**단계 2-2: SpecNormalizer.normalize() 수정**

```typescript
// packages/normalizers/spec-normalizer/src/index.ts

import { Normalizer } from '../types';
import { UUMDocument, UUMNode } from '../../../core-engine/src/types';
import { SpecNormalizerOptions } from './types';
import { parseSpecLine, filterSpecText } from './filters';

export const SpecNormalizer: Normalizer = {
  canHandle: (input: any) => typeof input === 'string',
  normalize: async (
    specText: string,
    options?: SpecNormalizerOptions
  ): Promise<UUMDocument> => {
    try {
      if (!specText || typeof specText !== 'string') {
        return {
          platform: 'SPEC',
          source: 'spec.md',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      const enableFiltering = options?.enableFiltering !== false;
      const filterOptions = options?.filterOptions || {};

      const lines = specText.split('\n').filter(Boolean);
      const nodes: UUMNode[] = [];

      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        
        // 라인 파싱
        const parsed = parseSpecLine(line);
        
        // 필터링 활성화 시 필터링 수행
        if (enableFiltering) {
          const shouldInclude = filterSpecText(parsed, filterOptions);
          if (!shouldInclude) {
            continue; // 필터링된 라인은 제외
          }
        }
        
        // UUMNode 생성
        nodes.push({
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
            isMetadata: parsed.isMetadata,
            isDescription: parsed.isDescription,
          },
        });
      }

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
```

**단계 2-3: `reverseComparisonRule` 수정**

```typescript
// packages/core-engine/src/rules.ts

export const reverseComparisonRule: DiffRule = {
  id: 'reverse.comparison',
  description: 'Figma의 UI 텍스트가 Spec 문서에 언급되는지 확인 (역방향 비교)',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
    const specDoc = docs.find((d) => d.platform === 'SPEC');

    if (!figmaDoc) return findings;

    // SpecItems만 사용 (필터링된 UI 텍스트만)
    const textSpecItems = specItems.filter((item) => item.kind === 'TEXT' && item.text);
    const specTexts = textSpecItems.map((item) => normalizeText(item.text!)).filter(Boolean);
    const specItemsCount = textSpecItems.length;

    // [변경] SpecDoc.nodes 대신 specItems만 사용하여 키워드 매칭
    // SpecDoc.nodes는 필터링되지 않은 모든 노드를 포함할 수 있으므로 사용하지 않음
    const specFullText = specTexts.join(' ').toLowerCase();

    // Spec 전체 텍스트에서 특정 텍스트 검색 hit 개수 계산
    const countSpecFulltextHits = (searchText: string): number => {
      if (!specFullText) return 0;
      const normalized = normalizeText(searchText);
      const regex = new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = specFullText.match(regex);
      return matches ? matches.length : 0;
    };

    // Figma의 TEXT 노드만 확인 (실제 UI 텍스트만)
    for (const figmaNode of figmaDoc.nodes) {
      // ... 기존 필터링 로직 유지 ...
      
      // [변경] specDoc.nodes 대신 specItems 기반 매칭 사용
      // 기존 로직은 specDoc.nodes를 사용했지만, 이제는 specItems만 사용
    }

    return findings;
  },
};
```

### 4.3 Phase 3: FigmaNormalizer 필터링 패턴 확장 (REQ-2)

**단계 3-1: FigmaNormalizer 필터링 강화**

```typescript
// packages/normalizers/figma-normalizer/src/index.ts

// 디자이너 가이드 텍스트 필터링 함수 확장
const isDesignerGuideText = (text: string): boolean => {
  const normalized = text.trim().toLowerCase();

  // 기존 패턴들 유지
  // ... (기존 코드) ...

  // [추가] 새로운 메타데이터 패턴
  // 버전 정보 (예: "v1.0", "version 2.1")
  if (/^v\d+\.\d+/.test(normalized) || /^version\s+\d+/.test(normalized)) {
    return true;
  }

  // 색상 코드 (예: "#FFFFFF", "rgb(255,255,255)")
  if (/^#[0-9a-f]{3,6}$/i.test(normalized) || 
      /^rgb\([\d\s,]+\)$/i.test(normalized)) {
    return true;
  }

  // 레이어 이름 패턴 (예: "Layer 1", "Group 2")
  if (/^(layer|group|frame|component)\s+\d+$/i.test(normalized)) {
    return true;
  }

  // [추가] 텍스트 크기 기반 필터링 강화 (10px → 5px)
  // 이 부분은 pushNode 함수에서 처리

  return false;
};

// pushNode 함수 수정
const pushNode = (node: any, path: string, idx: number) => {
  // ... 기존 필터링 로직 ...

  // [변경] 텍스트 크기 임계값을 10px → 5px로 변경
  if (node.absoluteBoundingBox) {
    const width = node.absoluteBoundingBox.width || 0;
    const height = node.absoluteBoundingBox.height || 0;
    // 너비나 높이가 5px 미만이면 제외 (기존: 10px)
    if (width < 5 && height < 5) {
      return;
    }
  }

  // ... 나머지 로직 유지 ...
};
```

### 4.4 Phase 4: 노이즈 필터링 통합 (REQ-4)

**단계 4-1: `apps/diff-checker/lib/noise-filter.ts` 리팩토링**

```typescript
// apps/diff-checker/lib/noise-filter.ts

import { FilterChain, createCommonFilterChain } from '../../../packages/core-engine/src/filters';

/**
 * 노이즈 필터링: Footer/Policy/고객센터/약관/개인정보 등 고정 문구 제외
 * 
 * @deprecated 이 함수는 공통 필터링 모듈로 이동되었습니다.
 * 새로운 코드는 packages/core-engine/src/filters.ts의 FilterChain을 사용하세요.
 */
export function isNoise(text: string): boolean {
  const filterChain = createCommonFilterChain();
  const result = filterChain.filter(text);
  return !result.passed;
}

/**
 * SpecItem이 노이즈인지 확인
 */
export function isNoiseSpecItem(item: { text?: string; kind?: string; meta?: any }): boolean {
  if (!item.text) return true;
  
  const text = item.text.trim();
  
  // 표에서 추출된 항목은 더 관대하게 처리
  if (item.meta?.source === 'table') {
    // 표에서 추출된 항목은 기본적인 노이즈만 제외
    if (text.length < 2) return true;
    if (/^https?:\/\//i.test(text)) return true;
    if (/^[A-Z]+-\d+$/i.test(text)) return true; // Jira 티켓
    if (/^(비고|참고|note|reference):?$/i.test(text)) return true;
    // 표에서 추출된 항목은 나머지는 허용
    return false;
  }
  
  // 일반 텍스트는 공통 필터 적용
  return isNoise(item.text);
}
```

---

## 5. 구현 순서 및 우선순위

### Phase 1: 즉시 적용 (High Priority)
1. ✅ 공통 필터링 모듈 생성 (`packages/core-engine/src/filters.ts`)
2. ✅ SpecNormalizer 필터링 통합
3. ✅ `reverseComparisonRule` 수정 (specDoc.nodes → specItems)

**예상 효과**: False Positive 50% 이상 감소

### Phase 2: 단기 개선 (Medium Priority)
4. FigmaNormalizer 필터링 패턴 확장
5. `reverseComparisonRule` 매칭 정확도 향상
6. 노이즈 필터링 통합 및 리팩토링

**예상 효과**: False Positive 추가 30% 감소

---

## 6. 주의사항

### 6.1 하위 호환성
- `SpecNormalizer.normalize()`의 기본 동작은 필터링 활성화 (`enableFiltering: true`)
- 기존 코드에서 옵션을 전달하지 않으면 필터링이 자동으로 적용됨
- 필터링을 비활성화하려면 `enableFiltering: false` 옵션 전달

### 6.2 성능 고려사항
- 필터링 로직이 추가되어 성능 저하 가능성 있음
- 대량의 텍스트 처리 시 필터링 체인 최적화 필요
- 필요시 캐싱 또는 메모이제이션 고려

### 6.3 테스트 전략
- 기존 테스트 케이스 유지
- 필터링된 노드가 제대로 제외되는지 검증
- False Positive 감소율 측정 테스트 추가
- 회귀 테스트 수행 (기존 정상 케이스가 필터링되지 않는지 확인)

### 6.4 디버깅 지원
- 필터링된 이유를 `FilterResult.reason`에 기록
- 로깅 옵션 추가 고려 (어떤 텍스트가 왜 필터링되었는지)
- 개발 모드에서 필터링 상세 정보 제공

---

## 7. 검증 기준

### 7.1 기능 검증
- [ ] SpecNormalizer가 필터링된 노드만 반환하는지 확인
- [ ] `reverseComparisonRule`에서 specItems만 사용하는지 확인
- [ ] FigmaNormalizer 필터링 패턴이 확장되었는지 확인
- [ ] 공통 필터링 모듈이 정상 작동하는지 확인

### 7.2 성능 검증
- [ ] 필터링 추가로 인한 성능 저하가 허용 범위 내인지 확인
- [ ] 대량 텍스트 처리 시 응답 시간 측정

### 7.3 품질 검증
- [ ] False Positive가 50% 이상 감소했는지 확인
- [ ] 실제 UI 텍스트가 필터링되지 않는지 확인 (False Negative 방지)
- [ ] Diff 결과가 수십 건 이내로 감소했는지 확인

---

## 8. 다음 단계

1. **Agent 3 (구현 및 테스트 에이전트)에게 전달**
   - 이 설계 문서를 바탕으로 코드 구현
   - 테스트 코드 작성 및 실행
   - False Positive 감소율 검증

2. **검증 완료 후**
   - 프로덕션 배포
   - 모니터링 및 추가 개선 사항 파악

---

## 부록: 관련 파일 목록

### 수정 대상 파일
- `packages/normalizers/spec-normalizer/src/index.ts`
- `packages/core-engine/src/rules.ts` (reverseComparisonRule)
- `packages/normalizers/figma-normalizer/src/index.ts`
- `apps/diff-checker/lib/noise-filter.ts`

### 신규 생성 파일
- `packages/core-engine/src/filters.ts`
- `packages/normalizers/spec-normalizer/src/filters.ts`
- `packages/normalizers/spec-normalizer/src/types.ts`

### 참조 문서
- `docs/agents/agent-1-requirements/analysis-results/diff-checker-false-positive-analysis.md`
- `docs/PROJECT_CONSTITUTION.md`
- `docs/QA_IMPLEMENTATION_GUIDE.md`

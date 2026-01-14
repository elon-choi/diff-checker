# LLM 기반 Diff 비교 프롬프트 가이드

## 현재 상황

현재 LLM 검증은 **SpecItem 추출 단계**에서만 사용되고 있습니다:
- 번역키 필터링
- 메타데이터 제외

**실제 diff 비교는 규칙 기반**으로 진행됩니다:
- 텍스트 정확 매칭
- 유사도 계산 (단어 기반)
- selectorKey 매핑

## LLM 기반 Diff 비교 프롬프트 제안

### 프롬프트 1: 의미적 유사성 비교 (기본)

```typescript
const prompt = `
다음은 UI/UX 요구사항(Spec)과 디자인(Figma)의 텍스트 비교 요청입니다.

**요구사항 (Spec):**
텍스트: "${specItem.text}"
컨텍스트: ${specItem.sectionPath || specItem.meta?.section || '없음'}
의도: ${specItem.intent || 'UI 텍스트 표시'}

**디자인 (Figma):**
텍스트: "${figmaNode.text}"
위치: ${figmaNode.figmaPath || figmaNode.path || '없음'}
레이어명: ${figmaNode.name || '없음'}

**비교 기준:**
1. 의미적 동일성: 같은 의미를 전달하는가?
2. 표현 차이: 동일하지만 표현만 다른가? (예: "인기순" vs "인기 순위")
3. 누락: Spec에 있지만 Figma에 없는가?
4. 추가: Figma에 있지만 Spec에 없는가?

**응답 형식 (JSON):**
{
  "match": true/false,
  "matchType": "EXACT" | "SEMANTIC" | "SIMILAR" | "MISMATCH" | "MISSING" | "EXTRA",
  "confidence": 0.0-1.0,
  "reason": "판단 이유",
  "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | "NONE",
  "suggestion": "개선 제안 (있는 경우)"
}
`;
```

### 프롬프트 2: 컨텍스트 기반 비교 (고급)

```typescript
const prompt = `
UI/UX 요구사항과 디자인을 비교하여 차이점을 분석해주세요.

**요구사항 정보:**
- 텍스트: "${specItem.text}"
- 섹션: ${specItem.sectionPath || '없음'}
- 기능: ${specItem.meta?.feature || '없음'}
- 의도: ${specItem.intent || 'UI 텍스트 표시'}
- 예상 값: ${specItem.expected || '없음'}

**디자인 정보:**
- 텍스트: "${figmaNode.text}"
- 위치: ${figmaNode.figmaPath || '없음'}
- 레이어명: ${figmaNode.name || '없음'}
- 스타일: ${JSON.stringify(figmaNode.meta?.textStyle || {})}

**비교 분석:**
1. **의미적 동일성**: 두 텍스트가 같은 의미를 전달하는가?
   - 예: "인기순" = "인기 순위" = "인기순위" (동일)
   - 예: "삭제" ≠ "제거" (유사하지만 다름)

2. **표현 차이**: 동일한 의미지만 표현이 다른가?
   - 띄어쓰기 차이: "인기순" vs "인기 순"
   - 약어 vs 전체: "인기순" vs "인기 순위"
   - 동의어: "삭제" vs "제거"

3. **컨텍스트 고려**: 위치와 기능을 고려했을 때 적절한가?
   - 같은 기능 영역에 있는가?
   - 사용자 의도와 일치하는가?

4. **심각도 판단**:
   - CRITICAL: 핵심 기능이 누락되거나 잘못됨
   - MAJOR: 중요한 텍스트가 다르거나 누락됨
   - MINOR: 표현만 다르지만 의미는 동일
   - INFO: 미미한 차이 또는 스타일 차이
   - NONE: 차이 없음

**응답 형식 (JSON):**
{
  "match": true/false,
  "matchType": "EXACT" | "SEMANTIC" | "SIMILAR" | "MISMATCH" | "MISSING" | "EXTRA",
  "confidence": 0.0-1.0,
  "reason": "상세한 판단 이유",
  "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | "NONE",
  "semanticSimilarity": 0.0-1.0,
  "suggestion": "개선 제안 (있는 경우)",
  "examples": ["유사한 표현 예시들"]
}
`;
```

### 프롬프트 3: 배치 비교 (효율적)

```typescript
const prompt = `
다음은 UI/UX 요구사항(Spec)과 디자인(Figma)의 텍스트 목록입니다.
각 쌍을 비교하여 차이점을 분석해주세요.

**요구사항 목록:**
${specItems.map((item, i) => `
${i + 1}. 텍스트: "${item.text}"
   섹션: ${item.sectionPath || '없음'}
   의도: ${item.intent || 'UI 텍스트 표시'}
`).join('\n')}

**디자인 목록:**
${figmaNodes.map((node, i) => `
${i + 1}. 텍스트: "${node.text}"
   위치: ${node.figmaPath || '없음'}
   레이어명: ${node.name || '없음'}
`).join('\n')}

**비교 규칙:**
1. 의미적 동일성 우선 (정확한 텍스트 매칭보다 의미가 중요)
2. 컨텍스트 고려 (같은 기능 영역인지 확인)
3. 표현 차이 허용 (띄어쓰기, 약어 등)

**응답 형식 (JSON):**
{
  "comparisons": [
    {
      "specIndex": 0,
      "figmaIndex": 0,
      "match": true/false,
      "matchType": "EXACT" | "SEMANTIC" | "SIMILAR" | "MISMATCH" | "MISSING" | "EXTRA",
      "confidence": 0.0-1.0,
      "reason": "판단 이유",
      "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | "NONE"
    }
  ],
  "unmatchedSpecs": [0, 1, 2], // 매칭되지 않은 Spec 인덱스
  "unmatchedFigmas": [0, 1, 2] // 매칭되지 않은 Figma 인덱스
}
`;
```

### 프롬프트 4: 한국어 특화 비교 (권장)

```typescript
const prompt = `
한국어 UI/UX 요구사항과 디자인 텍스트를 비교해주세요.

**요구사항:**
텍스트: "${specItem.text}"
컨텍스트: ${specItem.sectionPath || '없음'}
의도: ${specItem.intent || 'UI 텍스트 표시'}

**디자인:**
텍스트: "${figmaNode.text}"
위치: ${figmaNode.figmaPath || '없음'}

**한국어 특수 고려사항:**
1. 띄어쓰기 차이 허용: "인기순" = "인기 순" = "인기순위"
2. 조사 변형 허용: "삭제" = "삭제하기" = "삭제하세요"
3. 존댓말 차이 허용: "확인" = "확인하세요" = "확인해주세요"
4. 약어 허용: "인기순" = "인기 순위"
5. 동의어 구분: "삭제" ≠ "제거" (의미가 다를 수 있음)

**비교 기준:**
- EXACT: 완전히 동일
- SEMANTIC: 의미적으로 동일 (띄어쓰기, 조사만 다름)
- SIMILAR: 유사하지만 약간 다름
- MISMATCH: 의미가 다름
- MISSING: Spec에 있지만 Figma에 없음
- EXTRA: Figma에 있지만 Spec에 없음

**응답 형식 (JSON):**
{
  "match": true/false,
  "matchType": "EXACT" | "SEMANTIC" | "SIMILAR" | "MISMATCH" | "MISSING" | "EXTRA",
  "confidence": 0.0-1.0,
  "reason": "판단 이유 (한국어 특성을 고려한 설명)",
  "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | "NONE",
  "koreanVariations": ["인기순", "인기 순", "인기순위"], // 동일한 의미의 변형들
  "suggestion": "개선 제안"
}
`;
```

## 구현 제안

### 1. LLM 기반 Diff Rule 추가

```typescript
// packages/core-engine/src/rules.ts

export const llmDiffRule: DiffRule = {
  id: 'llm.diff',
  description: 'LLM 기반 의미적 비교',
  async apply(docs: UUMDocument[], specItems: SpecItem[]): Promise<DiffFinding[]> {
    const findings: DiffFinding[] = [];
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
    
    if (!figmaDoc) return findings;
    
    // LLM 활성화 확인
    const llmEnabled = process.env.LLM_DIFF_ENABLED === 'true';
    if (!llmEnabled) return findings;
    
    // SpecItem과 FigmaNode 비교
    for (const specItem of specItems) {
      if (!specItem.text) continue;
      
      // 가장 유사한 FigmaNode 찾기 (규칙 기반으로 후보 선정)
      const candidates = findCandidateNodes(specItem, figmaDoc.nodes);
      
      // LLM으로 정교한 비교
      for (const candidate of candidates.slice(0, 3)) { // 상위 3개만
        const result = await compareWithLLM(specItem, candidate);
        
        if (result.matchType === 'MISMATCH' || result.matchType === 'MISSING') {
          findings.push({
            id: `llm:${specItem.id}:${candidate.uid}`,
            severity: result.severity,
            category: result.matchType === 'MISSING' ? 'MISSING_ELEMENT' : 'TEXT_MISMATCH',
            description: result.reason,
            // ... 기타 필드
          });
        }
      }
    }
    
    return findings;
  }
};
```

### 2. 프롬프트 함수

```typescript
async function compareWithLLM(
  specItem: SpecItem,
  figmaNode: UUMNode
): Promise<LLMComparisonResult> {
  const prompt = `... (위의 프롬프트 4 사용) ...`;
  
  const response = await callLLM(prompt);
  return JSON.parse(response);
}
```

## 권장 프롬프트

**프롬프트 4 (한국어 특화)**를 권장합니다:
- 한국어 특성 고려 (띄어쓰기, 조사, 존댓말)
- 의미적 동일성 우선
- 실용적인 판단 기준

## 다음 단계

1. `LLM_DIFF_ENABLED=true` 환경 변수 추가
2. `llmDiffRule` 구현
3. 기존 규칙과 병행 실행 (LLM은 보조 역할)
4. 결과 비교 및 정확도 측정

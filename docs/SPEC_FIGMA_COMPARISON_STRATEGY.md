# Spec ↔ Figma 비교 전략

## 핵심 문제

**위키 문서가 구조화되어 있지 않은 경우** (일반적인 자연어 설명만 있는 경우) 어떻게 비교할 것인가?

### 문제 상황

```
위키 문서 예시 (구조화되지 않은 경우):
"시간표 화면에 정렬 기능을 추가합니다. 
사용자는 필터 버튼을 통해 정렬 옵션을 선택할 수 있으며, 
원기소, 조회순 등의 옵션이 제공됩니다."

Figma:
- 버튼: "필터"
- 옵션: "원기소", "조회순"
```

**문제**: 위키의 자연어 설명을 Figma의 UI 텍스트와 어떻게 매칭할 것인가?

## 현재 시스템의 한계

### 1. 텍스트 매칭 방식의 문제

현재 시스템은 **문자열 유사도**만 사용합니다:

```typescript
// 현재 방식
Spec: "시간표 화면에 정렬 기능을 추가합니다"
Figma: "필터", "원기소", "조회순"
→ 유사도 0% → MISSING_ELEMENT로 판단 (잘못된 결과)
```

**문제점**:
- 자연어 설명과 UI 텍스트는 본질적으로 다름
- "정렬 기능을 추가합니다" ≠ "필터" 버튼
- 의미는 같지만 표현이 완전히 다름

### 2. 비교 방향의 문제

**현재**: Spec → Figma (Spec의 모든 텍스트를 Figma에서 찾기)
- ❌ Spec의 설명 텍스트는 Figma에 없음 (당연함)
- ❌ 많은 false positive 발생

**개선**: Figma → Spec (Figma의 UI 텍스트가 Spec에 언급되는지 확인)
- ✅ Figma의 "필터"가 Spec에 언급되는지 확인
- ✅ 더 의미 있는 비교 가능

## 해결 방안

### 방안 1: 역방향 비교 (Figma → Spec) - 즉시 적용 가능

**핵심 아이디어**: Figma의 모든 UI 텍스트를 추출하고, Spec 문서에서 해당 텍스트가 **언급**되는지 확인

```typescript
// 개선된 비교 방식
Figma 텍스트: "필터"
Spec 문서: "필터 버튼을 통해 정렬 옵션을 선택할 수 있으며"
→ "필터" 키워드 발견 → ✅ 매칭 성공

Figma 텍스트: "원기소"
Spec 문서: "원기소, 조회순 등의 옵션이 제공됩니다"
→ "원기소" 키워드 발견 → ✅ 매칭 성공

Figma 텍스트: "새로운버튼"
Spec 문서: (언급 없음)
→ 키워드 없음 → ⚠️ MISSING_ELEMENT (Spec에 언급되지 않은 UI 요소)
```

**장점**:
- 자연어 Spec과도 비교 가능
- 실제 UI 요소 누락만 감지
- False positive 감소

**단점**:
- 정확한 텍스트 매칭이 아닌 키워드 매칭
- 동의어 처리 필요 ("필터" vs "정렬 필터")

### 방안 2: LLM 활용 자동 추출 - 중기 개선

**핵심 아이디어**: LLM을 사용하여 자연어 Spec에서 UI 텍스트 자동 추출

```typescript
// LLM 프롬프트 예시
const prompt = `
위키 문서에서 실제 화면에 표시되는 UI 텍스트만 추출하세요:
- 버튼명, 라벨, 옵션명 등
- 사용자에게 보이는 모든 텍스트

위키 문서:
${specText}

추출된 UI 텍스트 목록:
`;

// LLM 응답 예시
[
  "필터",
  "원기소",
  "조회순",
  "정렬 선택"
]
```

**장점**:
- 자연어 Spec에서도 자동 추출 가능
- 구조화되지 않은 문서도 처리 가능

**단점**:
- LLM 비용 및 지연 시간
- 추출 정확도 의존

### 방안 3: 구조화된 Spec 작성 가이드 - 장기 개선

**핵심 아이디어**: 위키 작성 시 구조화된 형식 사용 권장

#### 형식 A: 따옴표 사용

```
시간표 화면에 정렬 기능을 추가합니다.

UI 요소:
- "필터" 버튼
- "정렬 선택" 섹션
  - "원기소" 옵션
  - "조회순" 옵션
```

#### 형식 B: YAML 형식

```yaml
ui_elements:
  - type: button
    text: "필터"
    location: "시간표 화면"
  - type: section
    text: "정렬 선택"
    options:
      - "원기소"
      - "조회순"
```

**장점**:
- 명확한 비교 가능
- 자동화 용이

**단점**:
- 기존 위키 문서 수정 필요
- 작성자 교육 필요

### 방안 4: 하이브리드 접근 - 권장

**단계별 비교**:

1. **1차: 역방향 비교 (Figma → Spec)**
   - Figma의 모든 텍스트를 Spec에서 찾기
   - 키워드 매칭 사용

2. **2차: 구조화된 항목 비교 (Spec → Figma)**
   - 따옴표로 감싼 텍스트, "XXX 버튼" 등
   - 정확한 텍스트 매칭 사용

3. **3차: LLM 후처리 (선택사항)**
   - 의미 동치 판단
   - Finding 요약 및 병합

## 구현 계획

### Phase 1: 역방향 비교 구현 (즉시)

```typescript
// 새로운 비교 규칙 추가
export const reverseComparisonRule: DiffRule = {
  apply: (docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] => {
    const findings: DiffFinding[] = [];
    const specDoc = docs.find(d => d.platform === 'SPEC');
    const figmaDoc = docs.find(d => d.platform === 'FIGMA');
    
    if (!specDoc || !figmaDoc) return findings;
    
    const specText = specDoc.nodes.map(n => n.text).join(' ');
    
    // Figma의 모든 텍스트를 Spec에서 찾기
    for (const figmaNode of figmaDoc.nodes) {
      if (!figmaNode.text) continue;
      
      const keyword = normalizeText(figmaNode.text);
      const mentioned = includesText(specText, keyword);
      
      if (!mentioned) {
        findings.push({
          id: `reverse-${figmaNode.uid}`,
          severity: 'MAJOR',
          category: 'MISSING_ELEMENT',
          description: `Figma UI 텍스트 "${figmaNode.text}"가 Spec에 언급되지 않음`,
          evidence: { figma: figmaNode, spec: specDoc },
        });
      }
    }
    
    return findings;
  },
};
```

### Phase 2: LLM 자동 추출 (중기)

```typescript
// SpecNormalizer 개선
async function extractUITextWithLLM(specText: string): Promise<string[]> {
  const prompt = `...`;
  const extracted = await callLLM(prompt);
  return JSON.parse(extracted);
}
```

### Phase 3: 사용자 가이드 및 템플릿 (장기)

- 위키 작성 템플릿 제공
- 구조화된 형식 사용 권장 문서 작성

## 권장 사용 방법

### 현재 시스템 사용법 (구조화되지 않은 위키)

1. **Figma 텍스트 확인**
   - Figma에서 모든 UI 텍스트 추출
   - 버튼명, 라벨, 옵션명 등

2. **위키 문서 확인**
   - Figma의 각 텍스트가 위키에 언급되는지 확인
   - 수동으로 확인하거나 시스템이 자동 확인

3. **차이점 확인**
   - 위키에 언급되지 않은 UI 텍스트 → Spec 누락 가능성
   - 위키에만 있고 Figma에 없는 텍스트 → 디자인 누락 가능성

### 개선된 시스템 사용법 (역방향 비교 적용 후)

1. 위키 문서 전체 입력
2. Figma JSON 입력
3. 시스템이 자동으로:
   - Figma의 모든 텍스트를 위키에서 찾기
   - 위키의 구조화된 항목을 Figma에서 찾기
4. 결과 확인

## 결론

**구조화되지 않은 위키 문서와의 비교는 본질적으로 어렵습니다.**

가장 현실적인 해결책:
1. **단기**: 역방향 비교 (Figma → Spec) 구현
2. **중기**: LLM 활용 자동 추출
3. **장기**: 구조화된 Spec 작성 가이드 및 템플릿

**현재 권장사항**: 
- 가능하면 위키 작성 시 따옴표나 구조화된 형식 사용
- 불가능한 경우, 역방향 비교 방식 사용 (구현 필요)



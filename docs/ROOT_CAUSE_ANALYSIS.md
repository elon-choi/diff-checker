# 근본 원인 분석: 왜 2~3천 건도 너무 많은가?

## 문제 진단

### 현재 상황
- 현재: 14,778건 (대부분 False Positive)
- 개선 후 예상: 2~3천 건
- **정상적인 UI 비교**: 수십 건 ~ 수백 건 (최대)

**결론**: 2~3천 건도 여전히 비정상적으로 많음

---

## 근본 원인 분석

### 1. FigmaNormalizer의 과도한 추출

**현재 구현** (`packages/normalizers/figma-normalizer/src/index.ts`):
```typescript
const pushNode = (node: any, path: string, idx: number) => {
  nodes.push({
    uid: node.id ? String(node.id) : `figma-${idx}`,
    platform: 'FIGMA',
    role: node.type || 'NODE',
    name: node.name,        // ⚠️ 레이어 이름 (모든 노드)
    text: node.characters, // ⚠️ 텍스트 내용 (TEXT 노드만)
    // ...
  });
};

const walk = (node: any, path: string) => {
  const idx = nodes.length;
  pushNode(node, path, idx);  // ⚠️ 모든 노드를 push
  if (node.children) {
    node.children.forEach((child, i) => walk(child, `${path}/children/${i}`));
  }
};
```

**문제점**:
1. **모든 노드를 UUMNode로 변환**
   - FRAME, COMPONENT, GROUP 등 구조 노드도 포함
   - 레이어 이름 (`node.name`)도 모두 포함
   - 예: "Document", "Frame", "Component", "Instance" 등

2. **실제 UI 텍스트와 내부 레이블 구분 없음**
   - `node.name`: 레이어 이름 (디자이너가 붙인 이름)
   - `node.characters`: 실제 화면에 표시되는 텍스트
   - 둘 다 비교 대상으로 포함됨

3. **숨겨진/비표시 노드도 포함**
   - `visible: false`인 노드도 포함
   - 화면에 보이지 않는 노드도 비교 대상

**예시**:
```json
{
  "type": "FRAME",
  "name": "시간표 내 정렬 추가",  // ⚠️ 레이어 이름 (비교 대상에 포함됨)
  "children": [
    {
      "type": "TEXT",
      "name": "Title",              // ⚠️ 레이어 이름 (비교 대상에 포함됨)
      "characters": "필터"          // ✅ 실제 UI 텍스트
    },
    {
      "type": "COMPONENT",
      "name": "Button",             // ⚠️ 레이어 이름 (비교 대상에 포함됨)
      "visible": false              // ⚠️ 숨겨진 노드도 포함됨
    }
  ]
}
```

**영향**:
- Figma 노드 수: 수백 ~ 수천 개
- 실제 UI 텍스트: 수십 개
- 비교 대상: 수백 ~ 수천 개 (과도함)

---

### 2. SpecNormalizer의 과도한 추출

**현재 구현** (`packages/normalizers/spec-normalizer/src/index.ts`):
```typescript
normalize: async (specText: string): Promise<UUMDocument> => {
  const lines = specText.split('\n').filter(Boolean);
  
  const nodes: UUMNode[] = lines.map((line, idx) => ({
    uid: `spec-${idx}`,
    platform: 'SPEC',
    text: line.trim(),  // ⚠️ 모든 줄을 그대로 포함
    // ...
  }));
  
  return { platform: 'SPEC', nodes };
}
```

**문제점**:
1. **모든 줄을 노드로 변환**
   - 필터링 없음 (필터링은 `deriveSpecItemsFromMarkdown`에서만 수행)
   - 하지만 `reverseComparisonRule`에서는 `specDoc.nodes`를 직접 사용

2. **reverseComparisonRule에서 Spec 전체를 하나의 문자열로 합침**
   ```typescript
   const specText = specDoc.nodes
     .map((n) => n.text || n.name || '')
     .filter(Boolean)
     .join(' ')
     .toLowerCase();
   ```
   - 모든 줄이 하나의 문자열로 합쳐짐
   - 키워드 매칭이 너무 느슨해짐
   - 예: "필터"가 "필터 버튼을 클릭하면"에 포함되면 매칭됨

**영향**:
- Spec 줄 수: 수백 줄
- 실제 UI 텍스트: 수십 개
- 비교 대상: 수백 줄 (과도함)

---

### 3. reverseComparisonRule의 문제

**현재 구현** (`packages/core-engine/src/rules.ts`):
```typescript
export const reverseComparisonRule: DiffRule = {
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const specDoc = docs.find((d) => d.platform === 'SPEC');
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
    
    // ⚠️ Spec 문서 전체를 하나의 문자열로 합침
    const specText = specDoc.nodes
      .map((n) => n.text || n.name || '')
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    
    // ⚠️ Figma의 모든 노드를 확인
    for (const figmaNode of figmaDoc.nodes) {
      const figmaText = figmaNode.text || figmaNode.name;  // ⚠️ 레이어 이름도 포함
      
      // ⚠️ 키워드 부분 매칭만 사용
      const mentioned = includesText(specText, normalizedFigmaText);
      
      if (!mentioned) {
        // 키워드 부분 매칭 시도
        const words = normalizedFigmaText.split(' ').filter((w) => w.length > 2);
        const partialMatch = words.some((word) => includesText(specText, word));
        
        if (!partialMatch) {
          findings.push({ ... });  // ⚠️ False Positive 발생
        }
      }
    }
  }
}
```

**문제점**:
1. **Figma의 모든 노드를 비교 대상으로 사용**
   - 레이어 이름 (`node.name`)도 포함
   - 구조 노드 (FRAME, COMPONENT 등)도 포함
   - 숨겨진 노드도 포함

2. **Spec 전체를 하나의 문자열로 합침**
   - 키워드 매칭이 너무 느슨해짐
   - 예: "필터"가 "필터 버튼을 클릭하면"에 포함되면 매칭됨
   - 실제로는 "필터" 버튼이 Spec에 언급되었지만, "필터"라는 단어만 찾아서 매칭

3. **실제 UI 텍스트만 비교하지 않음**
   - `figmaNode.text || figmaNode.name` 사용
   - 레이어 이름도 비교 대상

**영향**:
- 비교 대상: 수백 ~ 수천 개
- 실제 UI 텍스트: 수십 개
- False Positive: 수백 ~ 수천 개

---

## 근본 원인 요약

### 핵심 문제

1. **FigmaNormalizer**: 모든 노드를 추출 (구조 노드, 레이어 이름 포함)
2. **SpecNormalizer**: 모든 줄을 추출 (필터링 없음)
3. **reverseComparisonRule**: 
   - Figma의 모든 노드를 비교 대상으로 사용
   - 레이어 이름도 비교 대상
   - Spec 전체를 하나의 문자열로 합쳐서 키워드 매칭만 사용

### 왜 2~3천 건이 나오는가?

**계산**:
- Figma 노드 수: ~500-1000개 (모든 노드 포함)
- 실제 UI 텍스트: ~50-100개
- 비교 대상: ~500-1000개
- False Positive 비율: ~80-90%
- 예상 차이: ~500-1000개

**실제로는**:
- 실제 UI 텍스트만 비교하면: ~50-100개
- 그 중 실제 차이: ~10-50개
- **정상적인 결과**: 수십 건 ~ 수백 건

---

## 해결 방안

### 1. FigmaNormalizer 개선: 실제 UI 텍스트만 추출

**개선 방안**:
```typescript
const pushNode = (node: any, path: string, idx: number) => {
  // ✅ TEXT 노드만 추출 (실제 화면에 표시되는 텍스트)
  if (node.type !== 'TEXT' || !node.characters) {
    return;  // 구조 노드는 제외
  }
  
  // ✅ visible이 false인 노드는 제외
  if (node.visible === false) {
    return;
  }
  
  // ✅ 레이어 이름은 제외, characters만 사용
  nodes.push({
    uid: node.id ? String(node.id) : `figma-${idx}`,
    platform: 'FIGMA',
    role: 'TEXT',
    text: node.characters,  // ✅ 실제 UI 텍스트만
    // name은 사용하지 않음
    // ...
  });
};
```

**예상 효과**:
- Figma 노드 수: ~500-1000개 → ~50-100개 (90% 감소)
- 비교 대상: ~500-1000개 → ~50-100개

### 2. reverseComparisonRule 개선: 실제 UI 텍스트만 비교

**개선 방안**:
```typescript
export const reverseComparisonRule: DiffRule = {
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const specDoc = docs.find((d) => d.platform === 'SPEC');
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
    
    // ✅ SpecItems만 사용 (필터링된 UI 텍스트만)
    const specTexts = specItems
      .filter(item => item.kind === 'TEXT')
      .map(item => normalizeText(item.text))
      .filter(Boolean);
    
    // ✅ Figma의 TEXT 노드만 확인 (characters만, name 제외)
    for (const figmaNode of figmaDoc.nodes) {
      // ✅ TEXT 노드만 확인
      if (figmaNode.role !== 'TEXT' || !figmaNode.text) {
        continue;
      }
      
      // ✅ visible이 false인 노드는 제외
      if (figmaNode.visible === false) {
        continue;
      }
      
      const figmaText = figmaNode.text;  // ✅ characters만 사용
      const normalizedFigmaText = normalizeText(figmaText);
      
      // ✅ SpecItems에서 정확히 매칭되는지 확인
      const mentioned = specTexts.some(specText => 
        specText.includes(normalizedFigmaText) || 
        normalizedFigmaText.includes(specText)
      );
      
      if (!mentioned) {
        findings.push({ ... });
      }
    }
  }
}
```

**예상 효과**:
- 비교 대상: ~500-1000개 → ~50-100개
- False Positive: ~80-90% → ~10-20%
- 예상 차이: ~500-1000개 → ~10-50개

### 3. SpecItems 기반 비교로 변경

**개선 방안**:
- `reverseComparisonRule`에서 `specDoc.nodes` 대신 `specItems` 사용
- `specItems`는 이미 필터링된 UI 텍스트만 포함
- 더 정확한 비교 가능

**예상 효과**:
- 비교 대상: 수백 줄 → 수십 개
- False Positive: ~80-90% → ~10-20%

---

## 종합 개선 효과 예상

### 현재
- Figma 노드: ~500-1000개 (모든 노드)
- Spec 줄: ~500줄 (모든 줄)
- 비교 대상: ~500-1000개
- False Positive: ~80-90%
- 예상 차이: ~500-1000개

### 개선 후
- Figma 노드: ~50-100개 (TEXT 노드만)
- Spec Items: ~50-100개 (필터링된 UI 텍스트만)
- 비교 대상: ~50-100개
- False Positive: ~10-20%
- 예상 차이: ~10-50개

**결론**: 2~3천 건 → **수십 건 ~ 수백 건**으로 감소 가능

---

## 권장 사항

### 즉시 적용 (높은 효과)

1. **FigmaNormalizer 개선**: TEXT 노드만 추출
2. **reverseComparisonRule 개선**: TEXT 노드만 비교, SpecItems 사용

### 단기 적용 (추가 정확도 향상)

3. **visible 필터링**: 숨겨진 노드 제외
4. **레이어 이름 제외**: `node.name` 사용하지 않음

### 중기 검토 (선택사항)

5. **의미 기반 매칭**: LLM 활용 (비용 고려)

---

## 결론

**근본 원인**: 
- Figma의 모든 노드를 비교 대상으로 사용
- 레이어 이름도 비교 대상으로 포함
- Spec 전체를 하나의 문자열로 합쳐서 키워드 매칭만 사용

**해결 방안**:
- 실제 UI 텍스트만 비교 (TEXT 노드만, characters만)
- SpecItems 기반 비교로 변경
- visible 필터링 추가

**예상 효과**:
- 2~3천 건 → **수십 건 ~ 수백 건**으로 감소
- False Positive: ~80-90% → ~10-20%
- 안정성: 중간 → **높음**



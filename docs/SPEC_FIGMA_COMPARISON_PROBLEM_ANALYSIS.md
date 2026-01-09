# 요구사항 문서 ↔ Figma 디자인 비교 문제 분석

## 1. 현재 구현되어 있는 로직 정리

### 1.1 데이터 변환 과정

```
요구사항 문서 (위키/텍스트)
  ↓ SpecNormalizer.normalize()
UUMDocument (모든 줄을 UUMNode로 변환)
  ↓ deriveSpecItemsFromMarkdown() (API 라우트에서)
SpecItem[] (필터링된 비교 대상)
  ↓
Diff Engine
  ↓
Figma JSON
  ↓ FigmaNormalizer.normalize()
UUMDocument (모든 노드를 UUMNode로 변환)
```

### 1.2 SpecNormalizer 구현 (`packages/normalizers/spec-normalizer/src/index.ts`)

**현재 로직**:
```typescript
normalize: async (specText: string): Promise<UUMDocument> => {
  const lines = specText.split('\n').filter(Boolean);
  
  // 모든 줄을 그대로 UUMNode로 변환
  const nodes: UUMNode[] = lines.map((line, idx) => ({
    uid: `spec-${idx}`,
    platform: 'SPEC',
    text: line.trim(),  // 줄 전체를 텍스트로 저장
    role: 'TEXT',
    selector: `/spec/${idx}`,
    visible: true,
    path: `/spec/${idx}`,
  }));
  
  return { platform: 'SPEC', nodes };
}
```

**특징**:
- 모든 줄을 그대로 UUMNode로 변환
- 필터링 없음
- 메타데이터, 설명 텍스트, UI 텍스트 구분 없음

### 1.3 deriveSpecItemsFromMarkdown 구현 (`apps/diff-checker/app/api/diff/route.ts`)

**현재 로직**:
```typescript
function deriveSpecItemsFromMarkdown(specText: string): SpecItem[] {
  const lines = specText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: SpecItem[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 1. 따옴표로 감싼 텍스트 추출
    const quoted = line.match(/"([^"]+)"/);
    if (quoted) {
      if (!isMetadata(quoted[1])) {
        items.push({ id: `spec-text-${i}`, kind: 'TEXT', text: quoted[1] });
      }
      continue;
    }
    
    // 2. 가시성 요구사항
    if (line.includes('노출되어야') || line.includes('노출')) {
      items.push({ id: `spec-visibility-${i}`, kind: 'STATE', visibility: 'show' });
      continue;
    }
    
    // 3. 일반 텍스트 필터링
    if (!isMetadata(line)) {
      // 50자 이상은 설명으로 간주 (UI 키워드 없으면 제외)
      if (line.length > 50) {
        const hasUIKeyword = uiKeywords.some(keyword => line.includes(keyword));
        if (!hasUIKeyword) continue;
      }
      
      // UI 키워드가 있거나 20자 이하만 포함
      if (hasUIKeyword || (line.length <= 20 && line.length > 2)) {
        items.push({ id: `spec-text-${i}`, kind: 'TEXT', text: line });
      }
    }
  }
  
  return items;
}
```

**필터링 규칙**:
- 메타데이터 패턴 제외 (티켓 번호, UUID, 색상 코드 등)
- 50자 이상 긴 문장은 UI 키워드 없으면 제외
- 20자 이하 짧은 텍스트만 포함
- UI 키워드가 있는 경우만 포함

### 1.4 FigmaNormalizer 구현 (`packages/normalizers/figma-normalizer/src/index.ts`)

**현재 로직**:
```typescript
normalize: async (figmaJson: any): Promise<UUMDocument> => {
  const nodes: UUMNode[] = [];
  
  // 재귀적으로 모든 노드 순회
  const walk = (node: any, path: string) => {
    // 모든 노드를 UUMNode로 변환
    nodes.push({
      uid: node.id,
      platform: 'FIGMA',
      role: node.type,
      name: node.name,        // Figma 레이어 이름
      text: node.characters,  // 실제 텍스트 내용
      selector: path,
      visible: node.visible ?? true,
      bounds: node.absoluteBoundingBox,
    });
    
    // 자식 노드 재귀 처리
    if (node.children) {
      node.children.forEach((child, i) => walk(child, `${path}/children/${i}`));
    }
  };
  
  walk(data.document ?? data, '/figma');
  return { platform: 'FIGMA', nodes };
}
```

**특징**:
- 모든 노드를 UUMNode로 변환
- `name` (레이어 이름)과 `characters` (텍스트 내용) 모두 포함
- 내부 레이블과 실제 UI 텍스트 구분 없음

### 1.5 비교 규칙 (Diff Engine)

#### 정방향 비교: textStrictRule (`packages/core-engine/src/rules.ts`)

```typescript
export const textStrictRule: DiffRule = {
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    // SpecItem의 텍스트를 Figma에서 찾기
    for (const item of specItems) {
      const match = findMatchingNode(item, docs, index);
      
      if (!match) {
        // 매칭 실패 → MISSING_ELEMENT
        findings.push({
          severity: 'MAJOR',
          category: 'TEXT_MISMATCH',
          description: `스펙 텍스트가 미존재: "${item.text}"`,
        });
      } else if (match.matchType === 'similarity') {
        // 유사도 낮음 → TEXT_MISMATCH
        if (similarity < 0.9) {
          findings.push({ ... });
        }
      }
    }
  }
}
```

**매칭 우선순위**:
1. selector 매칭
2. role/path 매칭
3. text 유사도 매칭
4. keywords 매칭

#### 역방향 비교: reverseComparisonRule (`packages/core-engine/src/rules.ts`)

```typescript
export const reverseComparisonRule: DiffRule = {
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const specDoc = docs.find(d => d.platform === 'SPEC');
    const figmaDoc = docs.find(d => d.platform === 'FIGMA');
    
    // Spec 문서 전체 텍스트를 하나의 문자열로 결합
    const specText = specDoc.nodes.map(n => n.text || n.name || '').join(' ');
    
    // Figma의 모든 텍스트 노드 확인
    for (const figmaNode of figmaDoc.nodes) {
      const figmaText = figmaNode.text || figmaNode.name;
      
      // Spec 문서에서 해당 텍스트가 언급되는지 확인
      const mentioned = includesText(specText, figmaText);
      
      if (!mentioned) {
        // 언급되지 않음 → MISSING_ELEMENT
        findings.push({
          severity: 'MAJOR',
          category: 'MISSING_ELEMENT',
          description: `Figma UI 텍스트 "${figmaText}"가 Spec 문서에 언급되지 않음`,
        });
      }
    }
  }
}
```

**필터링**:
- Figma 내부 레이블 제외 (`document`, `title`, `screen` 등)
- 색상 코드 제외 (`#F4F5F7` 등)
- Boolean 값 제외 (`true`, `false`, `none` 등)

## 2. 현재의 로직에서 요구사항 비교 대응이 왜 어려운지

### 2.1 근본적인 문제: 데이터 구조의 불일치

#### 문제 1: 요구사항 문서의 성격
```
요구사항 문서:
- 프로젝트 개요 및 설명
- 메타데이터 (작성자, 날짜, 티켓 번호)
- 문서 구조 (목차, 섹션 헤더)
- 정책 설명 및 배경 설명
- 실제 UI 텍스트 (일부)
```

#### 문제 2: Figma 디자인의 성격
```
Figma 디자인:
- 실제 화면에 보이는 UI 요소만
- 버튼명, 라벨, 툴팁 등 사용자에게 보이는 텍스트
- 시각적 레이아웃 및 구조
- 내부 레이블 (레이어 이름)
```

**핵심 문제**: 요구사항 문서는 **설명 중심**, Figma는 **시각적 표현 중심**

### 2.2 구체적인 문제점

#### 문제점 1: SpecNormalizer의 과도한 추출

**현재 동작**:
```typescript
// 모든 줄을 그대로 UUMNode로 변환
lines.map((line, idx) => ({
  text: line.trim(),  // "현업 요구사항 및 기존 백로그를 기반으로..."
}))
```

**문제**:
- 설명 텍스트도 비교 대상에 포함됨
- 예: `"현업 요구사항 및 기존 백로그를 기반으로 우선순위를 산출하여 기능을 개선함"`
- 이 텍스트는 Figma에 없음 (당연함)
- 결과: False Positive 발생

#### 문제점 2: deriveSpecItemsFromMarkdown의 불완전한 필터링

**현재 필터링**:
- 메타데이터 패턴 제외 (부분적)
- 50자 이상 긴 문장 제외 (UI 키워드 없으면)
- 20자 이하만 포함

**문제**:
- 패턴 기반 필터링은 한계가 있음
- 새로운 메타데이터 형식 추가 시 패턴 업데이트 필요
- UI 키워드가 없는 실제 UI 텍스트도 제외될 수 있음
- 예: `"원기소"` (3자) → 포함됨 ✅
- 예: `"필터"` (2자) → 포함됨 ✅
- 예: `"현업 요구사항..."` (50자 이상, UI 키워드 없음) → 제외됨 ✅
- 예: `"#F4F5F7"` (색상 코드) → 패턴으로 제외됨 ✅
- 하지만 여전히 일부 메타데이터가 포함됨

#### 문제점 3: 정방향 비교의 한계

**현재 동작**:
```
Spec: "현업 요구사항 및 기존 백로그를 기반으로..."
  ↓ textStrictRule
Figma에서 해당 텍스트 찾기
  ↓
매칭 실패
  ↓
MISSING_ELEMENT 보고
```

**문제**:
- 설명 텍스트는 Figma에 없음 (당연함)
- 하지만 비교 대상에 포함되어 False Positive 발생
- 자연어 설명과 UI 텍스트를 구분할 수 없음

#### 문제점 4: 역방향 비교의 한계

**현재 동작**:
```
Figma: "필터"
  ↓ reverseComparisonRule
Spec 문서에서 "필터" 키워드 검색
  ↓
"필터 버튼을 통해..." 발견
  ↓
매칭 성공 ✅
```

**문제**:
- 키워드 매칭만 사용
- 동의어 처리 불가능 ("정렬" vs "필터")
- 문맥 이해 불가능 ("필터 기능" vs "필터 버튼")
- Figma 내부 레이블도 일부 포함됨 (`"Document"`, `"title"` 등)

#### 문제점 5: FigmaNormalizer의 과도한 추출

**현재 동작**:
```typescript
// 모든 노드를 UUMNode로 변환
nodes.push({
  name: node.name,        // "Document", "title", "screen" 등
  text: node.characters,  // 실제 텍스트
})
```

**문제**:
- Figma 내부 레이블 (`name`)도 비교 대상에 포함됨
- 실제 UI 텍스트 (`characters`)와 구분 없음
- 예: `name: "Document"` → 실제 UI 텍스트가 아님
- 예: `name: "필터 버튼"`, `characters: "필터"` → 둘 다 비교 대상

### 2.3 왜 어려운가? - 요약

1. **데이터 구조의 불일치**
   - 요구사항 문서: 설명 중심 (자연어)
   - Figma 디자인: 시각적 표현 중심 (UI 요소)

2. **비교 대상의 모호성**
   - 요구사항 문서의 어떤 텍스트가 실제 UI 텍스트인지 불명확
   - Figma의 어떤 텍스트가 실제 UI 텍스트인지 불명확

3. **필터링의 한계**
   - 패턴 기반 필터링은 완벽하지 않음
   - 새로운 형식 추가 시 패턴 업데이트 필요
   - UI 키워드 기반 필터링도 한계가 있음

4. **매칭 방식의 한계**
   - 문자열 매칭만 사용
   - 의미 기반 매칭 불가능
   - 동의어 처리 불가능

## 3. 문제 해결을 위한 방법

### 3.1 단기 해결 방안 (현재 적용 중)

#### 방안 1: 메타데이터 필터링 강화 ✅

**구현**:
- 색상 코드 패턴 추가: `/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/i`
- Boolean/null 값 패턴 추가: `/(true|false|none|null|undefined)$/i`
- Figma 내부 레이블 패턴 추가

**효과**:
- 메타데이터 관련 False Positive 감소
- 예상 감소율: ~30-40%

**한계**:
- 패턴 기반이라 새로운 형식 추가 시 업데이트 필요
- 완벽한 필터링 불가능

#### 방안 2: 설명 텍스트 필터링 ✅

**구현**:
- 50자 이상 긴 문장은 UI 키워드 없으면 제외
- 20자 이하 짧은 텍스트만 포함

**효과**:
- 설명 텍스트 관련 False Positive 감소
- 예상 감소율: ~50-60%

**한계**:
- UI 키워드가 없는 실제 UI 텍스트도 제외될 수 있음
- 예: `"원기소"` (3자) → 포함됨 ✅
- 예: `"필터"` (2자) → 포함됨 ✅
- 하지만 UI 키워드가 없는 긴 설명은 제외됨

#### 방안 3: 역방향 비교 추가 ✅

**구현**:
- Figma의 UI 텍스트가 Spec에 언급되는지 확인
- 키워드 부분 매칭 사용

**효과**:
- 자연어 Spec과도 비교 가능
- 실제 UI 요소 누락만 감지
- 예상 감소율: ~10-20%

**한계**:
- 키워드 매칭만 사용
- 동의어 처리 불가능
- 문맥 이해 불가능

### 3.2 중기 해결 방안 (구현 필요)

#### 방안 4: LLM 활용 자동 추출

**구현 계획**:
```typescript
async function extractUITextWithLLM(specText: string): Promise<string[]> {
  const prompt = `
위키 문서에서 실제 화면에 표시되는 UI 텍스트만 추출하세요:
- 버튼명, 라벨, 옵션명 등
- 사용자에게 보이는 모든 텍스트
- 메타데이터, 설명 텍스트는 제외

위키 문서:
${specText}

추출된 UI 텍스트 목록 (JSON 배열):
`;

  const response = await callLLM(prompt);
  return JSON.parse(response);
}
```

**장점**:
- 자연어 Spec에서도 자동 추출 가능
- 구조화되지 않은 문서도 처리 가능
- 의미 기반 추출 가능

**단점**:
- LLM 비용 및 지연 시간
- 추출 정확도 의존
- API 키 필요

**적용 시점**:
- `deriveSpecItemsFromMarkdown()` 함수에서 LLM 옵션 추가
- 환경 변수로 LLM 사용 여부 제어

#### 방안 5: 구조화된 Spec 입력 지원

**구현 계획**:
```yaml
# spec.yaml 형식 지원
ui_elements:
  - selector: "filter-button"
    text: "필터"
    role: "button"
    visible: true
  
  - selector: "sort-option-1"
    text: "원기소"
    role: "option"
    visible: true
```

**장점**:
- 명확한 비교 가능
- 자동화 용이
- False Positive 최소화

**단점**:
- 기존 위키 문서 수정 필요
- 작성자 교육 필요
- 구조화된 형식 작성 시간 증가

**적용 시점**:
- YAML 파서 추가
- UI에서 YAML 입력 옵션 제공

### 3.3 장기 해결 방안 (연구 필요)

#### 방안 6: 의미 기반 매칭

**구현 계획**:
- LLM을 활용한 의미 동치 판단
- 예: "정렬 기능" vs "필터" → 의미적으로 관련 있음
- 예: "필터 버튼" vs "필터" → 의미적으로 동일

**장점**:
- 동의어 처리 가능
- 문맥 이해 가능
- 더 정확한 매칭

**단점**:
- LLM 비용 증가
- 처리 시간 증가
- 정확도 의존

#### 방안 7: 사용자 지정 비교 항목

**구현 계획**:
- UI에서 비교할 항목 직접 선택
- 체크박스로 비교 포함/제외 선택
- 저장된 설정 재사용

**장점**:
- 사용자가 직접 제어
- False Positive 완전 제거 가능
- 유연한 비교

**단점**:
- 사용자 작업 시간 증가
- 자동화 정도 감소

### 3.4 권장 해결 방안 (하이브리드 접근)

**단계별 비교 전략**:

```
1단계: 역방향 비교 (Figma → Spec)
  → 자연어 Spec도 처리 가능
  → 실제 UI 요소 누락만 감지

2단계: 정방향 비교 (Spec → Figma)
  → 구조화된 항목 정확히 비교
  → 따옴표로 감싼 텍스트, "XXX 버튼" 등

3단계: LLM 후처리 (선택사항)
  → 의미 동치 판단
  → Finding 요약 및 병합
```

**구현 우선순위**:
1. ✅ 메타데이터 필터링 강화 (완료)
2. ✅ 설명 텍스트 필터링 (완료)
3. ✅ 역방향 비교 추가 (완료)
4. 🔄 LLM 자동 추출 (구현 필요)
5. 🔄 구조화된 Spec 입력 지원 (구현 필요)
6. 📋 의미 기반 매칭 (연구 필요)
7. 📋 사용자 지정 비교 항목 (연구 필요)

## 4. 결론

### 현재 상태
- 기본적인 비교 기능은 작동함
- 하지만 False Positive가 많음 (14,778건 중 대부분 메타데이터/설명 텍스트)
- 필터링 강화로 개선 중

### 개선 방향
1. **단기**: 필터링 강화로 False Positive 감소 (진행 중)
2. **중기**: LLM 활용 자동 추출로 정확도 향상
3. **장기**: 의미 기반 매칭으로 완벽한 비교

### 권장 사항
- **현재**: 필터링 강화된 버전으로 재비교
- **향후**: LLM 자동 추출 기능 추가 검토
- **장기**: 구조화된 Spec 작성 가이드 제공



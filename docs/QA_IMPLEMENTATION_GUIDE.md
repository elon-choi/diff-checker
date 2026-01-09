# Diff Checker 구현 가이드 (QA 기준)

## 0. 이 문서의 목적 (매우 중요)

이 프로젝트의 목적은
❌ 문서 간 텍스트 차이를 많이 찾는 것이 아니라  
✅ **QA가 실제로 판단 가능한 "요구사항 불일치 가능성"만을 식별**하는 것이다.

본 가이드는 Cursor AI가 다음을 절대 하지 않도록 하기 위한 **제약 문서**이다.

- 디자이너 가이드 텍스트를 요구사항으로 판단
- 단순 문자열 차이를 결함으로 판단
- 의미 없는 Diff를 대량 생성

---

## 1. 핵심 원칙 (절대 위반 금지)

### 1.1 Diff 결과는 "QA 판단 단위"여야 한다

❌ 잘못된 기준
- TEXT vs TEXT
- 문자열 유사도 기반 불일치
- 노드 단위 Diff

✅ 올바른 기준
- REQUIREMENT (요구사항) 단위
- "이 요구가 지켜졌는가?"
- "사람이 추가 확인해야 하는가?"

---

### 1.2 이 도구는 결함 판정기가 아니다

이 도구는 다음을 **하지 않는다**:
- 버그 확정
- 기획 오류 확정
- 수정 필요 여부 단정

이 도구는 다음만 수행한다:
- **확인 필요 영역 식별**
- QA 리스크 포인트 탐지
- Pre-QA 범위 축소

---

## 2. 반드시 제거해야 하는 비교 대상 (가이드 텍스트 필터링)

### 2.1 Figma 텍스트 중 비교 대상이 아닌 것 (Blacklist)

아래 항목은 **요구사항이 아니며, Diff 대상에서 반드시 제외**한다.

- 해상도/사이즈 설명
  - 예: `583 * 300`, `321-579`
- 폰트/디자인 가이드
  - 예: `텍스트 크기 30/36`
- 디자이너 작업 가이드
  - `Copy 가능`
  - `Text`
  - `Text + Image`
- 샘플/더미 텍스트
  - `일이삼사오육칠팔구십`
  - `Lorem ipsum`
- 날짜/버전 메모
  - `26.01.05 update`
- 구조/레이어 명칭
  - `Frame`
  - `Component`
  - `Group`
  - `Document`

👉 위 텍스트가 Diff 결과에 포함되면 **오탐(False Positive)** 으로 간주한다.

---

## 3. Spec 처리 기준 (요구사항 정규화)

### 3.1 Spec 문서는 "문서"가 아니라 "요구사항 집합"으로 다룬다

Spec 전체 텍스트를 그대로 비교하지 않는다.

Spec은 반드시 다음 단위로 분해되어야 한다:

```ts
RequirementItem {
  id: string
  type: 'UI_TEXT' | 'VISIBILITY' | 'POLICY'
  intent: string            // 무엇을 보장해야 하는가
  expected: string | boolean
  scope?: string            // 화면 / 기능 / 조건
}
```

---

## 4. 구현 세부 사항

### 4.1 FigmaNormalizer 필터링 로직

`packages/normalizers/figma-normalizer/src/index.ts`에 `isDesignerGuideText` 함수 구현:

```typescript
const isDesignerGuideText = (text: string): boolean => {
  // 해상도/사이즈 설명 제외
  // 폰트/디자인 가이드 제외
  // 디자이너 작업 가이드 제외
  // 샘플/더미 텍스트 제외
  // 날짜/버전 메모 제외
  // 구조/레이어 명칭 제외
};
```

### 4.2 SpecItem 타입 확장

`packages/core-engine/src/types.ts`의 `SpecItem` 인터페이스에 다음 필드 추가:

```typescript
export interface SpecItem {
  // ... 기존 필드
  intent?: string;      // 무엇을 보장해야 하는가
  expected?: string | boolean;  // 예상 값
  scope?: string;       // 화면 / 기능 / 조건
}
```

### 4.3 Diff 결과 생성 시 QA 관점 반영

모든 Diff 결과의 `description`은 다음 형식을 따라야 한다:

```
"[현상] (확인 필요)"
```

예:
- ✅ `Figma에 표시된 UI 텍스트 "필터"가 Spec 문서에 언급되지 않음 (확인 필요)`
- ❌ `텍스트 불일치: "필터"`

---

## 5. 테스트 기준

### 5.1 False Positive 테스트

다음 텍스트는 Diff 결과에 포함되면 안 된다:

- `583 * 300`
- `텍스트 크기 30/36`
- `Copy 가능`
- `일이삼사오육칠팔구십`
- `26.01.05 update`
- `Frame`
- `Component`

### 5.2 True Positive 테스트

다음 텍스트는 Diff 결과에 포함되어야 한다:

- 실제 버튼명: `필터`, `정렬`, `조회`
- 실제 라벨: `이름`, `날짜`, `상태`
- 실제 옵션: `원기소`, `조회순`, `2단`, `3단`

---

## 6. 가이드라인 통합

이 문서의 내용은 `diff_checker_guidelines.md`의 **14. 요구사항 문서 ↔ Figma 디자인 비교 보강 지침**에 통합되어야 한다.



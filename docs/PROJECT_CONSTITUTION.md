# Cursor Project Constitution – Diff Checker (QA 기준)

## 0. 절대적 목적 (이 문서가 최상위 규칙)

이 프로젝트의 목적은 단 하나다.

> **QA가 '추가 확인이 필요한 요구사항'을 빠르게 식별하도록 돕는 것**

이 프로젝트는:
- ❌ 문서 비교 도구가 아니다
- ❌ 문자열 Diff 도구가 아니다
- ❌ 결함을 자동 판정하는 도구가 아니다

---

## 1. 성공 / 실패 기준

### ❌ 실패
- Diff 결과가 많을수록 좋다고 판단
- TEXT_MISMATCH, MISSING_ELEMENT 다수 발생
- 디자이너 가이드 텍스트가 Diff에 포함됨
- QA가 결과를 보고 "그래서 뭘 보라는 거지?"라고 느끼는 경우

### ✅ 성공
- Diff 결과가 **수십 건 이내**
- QA가 보고 즉시
  - "이건 무시"
  - "이건 확인 필요"
  를 구분할 수 있음

---

## 2. Diff의 단위 (가장 중요)

### ❌ 금지된 비교 단위
- TEXT ↔ TEXT
- 문자열 유사도 기반 비교
- Figma 레이어 이름(name)
- 노드 단위 비교

### ✅ 허용된 비교 단위
- REQUIREMENT (요구사항)
- 정책 / 조건 / 사용자에게 보장되어야 하는 행동

---

## 3. Figma 처리 절대 규칙

### 3.1 비교 대상
- `node.type === TEXT`
- `node.characters` (실제 화면에 표시되는 텍스트)

### 3.2 아래 항목이 Diff에 나오면 구현 실패
- 해상도 / 사이즈 설명 (예: 583 * 300)
- 폰트 크기 / 디자인 가이드
- Copy 가능 / Text / Text + Image
- 더미 텍스트 (일이삼사…, Lorem ipsum)
- 날짜 / 버전 메모
- Frame / Component / Group / Document 같은 레이어 이름

👉 위 항목은 **요구사항이 아니다.**

---

## 4. Spec 해석 규칙

### 4.1 Spec은 문서가 아니다
Spec 전체 텍스트를 그대로 비교하는 행위는 금지한다.

Spec은 반드시 다음 구조로 해석되어야 한다:

```ts
RequirementItem {
  id: string
  intent: string            // 무엇을 보장해야 하는가
  type: 'UI_TEXT' | 'VISIBILITY' | 'POLICY'
  expected: string | boolean
  scope?: string
}
```

---

## 5. 구현 검증 체크리스트

모든 구현은 다음을 확인해야 한다:

- [ ] Diff 결과가 수십 건 이내인가?
- [ ] 디자이너 가이드 텍스트가 Diff에 포함되지 않는가?
- [ ] TEXT ↔ TEXT 비교를 하지 않는가?
- [ ] Spec이 RequirementItem 구조로 해석되는가?
- [ ] QA가 결과를 보고 즉시 판단할 수 있는가?

---

## 6. 위반 시 조치

이 헌장을 위반하는 구현은:
1. 즉시 수정되어야 함
2. 테스트 케이스로 검증되어야 함
3. 재발 방지 대책이 수립되어야 함



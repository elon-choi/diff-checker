# 작업 요청 결정 트리

## 빠른 판단 가이드

```
작업 요청
    ↓
어떤 작업인가?
    ↓
┌─────────────────┬─────────────────┐
│   간단한 작업    │   복잡한 작업    │
└─────────────────┴─────────────────┘
        ↓                    ↓
   Agent 3에게          Agent 1부터
   직접 요청            순차 진행
```

---

## 간단한 작업 판단 기준

### ✅ Agent 3에게 직접 요청

**조건:**
- 파일 1-2개 수정
- 명확한 수정 사항
- 테스트가 간단함
- 즉시 수정 가능

**예시:**
```
✅ "버튼 텍스트 오타 수정해줘"
✅ "console.log 제거해줘"
✅ "타입 에러 수정해줘"
✅ "간단한 필터링 로직 추가해줘"
✅ "특정 함수의 버그 수정해줘"
```

**요청 방법:**
```
Agent 3에게:
"[작업 내용]을 수정해줘.
[파일 경로]를 수정하면 돼."
```

---

## 복잡한 작업 판단 기준

### ✅ Agent 1부터 순차 진행

**조건:**
- 파일 3개 이상 수정
- 설계가 필요한 작업
- 여러 단계가 필요한 작업
- 테스트가 복잡함
- 아키텍처 변경

**예시:**
```
✅ "새로운 diff 규칙 추가"
✅ "성능 최적화 프로젝트"
✅ "대규모 리팩토링"
✅ "새로운 기능 개발"
✅ "아키텍처 변경"
```

**요청 방법:**

#### Step 1: Agent 1에게
```
"[작업 내용]을 분석해줘.
분석 결과는 docs/agents/agent-1-requirements/analysis-results/[작업명].md에 저장해줘."
```

#### Step 2: Agent 2에게 (Agent 1 완료 후)
```
"Agent 1의 분석 결과를 읽고 설계해줘.
참조: docs/agents/agent-1-requirements/analysis-results/[작업명].md
결과는 docs/agents/agent-2-design/design-docs/[기능명]-design.md에 저장해줘."
```

#### Step 3: Agent 3에게 (Agent 2 완료 후)
```
"Agent 2의 설계를 읽고 구현하고 테스트해줘.
참조: docs/agents/agent-2-design/design-docs/[기능명]-design.md
테스트 결과는 docs/agents/agent-3-implementation/test-results/[기능명]-test-report.md에 저장해줘."
```

---

## 중간 복잡도 작업

### 🤔 판단이 어려울 때

**전략: Agent 3으로 시작, 필요시 확장**

1. **Agent 3에게 먼저 요청**
   ```
   "[작업 내용]을 수정해줘"
   ```

2. **Agent 3이 복잡하다고 판단하면**
   - Agent 1에게 분석 요청
   - Agent 2에게 설계 요청
   - 다시 Agent 3에게 구현 요청

**예시:**
```
1차 시도: Agent 3에게 "노이즈 필터링 강화해줘"
→ Agent 3: "복잡하니 설계가 필요합니다"

2차 시도: 
- Agent 1: "노이즈 필터링 강화 분석"
- Agent 2: "필터링 로직 설계"
- Agent 3: "구현 및 테스트"
```

---

## 실전 예시

### 예시 1: 간단한 작업

**요청:**
```
Agent 3에게:
"reverse.comparison 규칙에서 '·' 같은 특수 문자를 필터링해줘.
rules.ts 파일의 reverseComparisonRule 함수를 수정하면 돼."
```

**결과:** 바로 수정 완료 ✅

---

### 예시 2: 복잡한 작업

**요청:**

**Agent 1:**
```
"새로운 diff 규칙 'color.diff' 추가 요구사항을 분석해줘.
텍스트 색상 비교 규칙이 필요한 이유, 요구사항을 도출해줘.
결과는 docs/agents/agent-1-requirements/analysis-results/color-diff-rule.md에 저장해줘."
```

**Agent 2 (Agent 1 완료 후):**
```
"Agent 1의 분석 결과를 읽고 colorDiffRule 인터페이스를 설계해줘.
참조: docs/agents/agent-1-requirements/analysis-results/color-diff-rule.md
결과는 docs/agents/agent-2-design/design-docs/color-diff-rule-design.md에 저장해줘."
```

**Agent 3 (Agent 2 완료 후):**
```
"Agent 2의 설계를 읽고 구현하고 테스트해줘.
참조: docs/agents/agent-2-design/design-docs/color-diff-rule-design.md
테스트 결과는 docs/agents/agent-3-implementation/test-results/color-diff-rule-test-report.md에 저장해줘."
```

---

## 요약

### 기본 원칙

1. **간단한 작업** → Agent 3에게 직접 요청
2. **복잡한 작업** → Agent 1 → Agent 2 → Agent 3 순차 진행
3. **불확실할 때** → Agent 3으로 시작, 필요시 확장

### 판단 기준

| 기준 | 간단한 작업 | 복잡한 작업 |
|------|------------|------------|
| 파일 수 | 1-2개 | 3개 이상 |
| 수정 범위 | 작음 | 큼 |
| 설계 필요 | 없음 | 필요 |
| 테스트 | 간단 | 복잡 |
| 시간 | 빠름 (분 단위) | 느림 (시간 단위) |

---

## 팁

- **처음에는 Agent 3으로 시작**해보고, 복잡하면 확장
- **작은 작업은 빠르게**, 큰 작업은 체계적으로
- **각 Agent의 역할을 명확히** 유지

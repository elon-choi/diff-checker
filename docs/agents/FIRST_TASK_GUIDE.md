# 첫 작업 가이드: 3-Agent로 작업 시작하기

## ✅ 설정 완료 확인

다음 3개 Agent가 생성되었는지 확인하세요:
- ✅ Agent 1: 요구사항 분석
- ✅ Agent 2: 코드 설계
- ✅ Agent 3: 구현 및 테스트

---

## 첫 작업 예시

### 예시 1: 간단한 작업 (방식 1 - 직접 지시)

**Agent 3에게 직접 요청:**
```
"reverse.comparison 규칙에서 '·' 같은 특수 문자를 필터링해줘.
rules.ts 파일의 reverseComparisonRule 함수를 수정하면 돼."
```

→ 바로 수정 완료

---

### 예시 2: 복잡한 작업 (방식 2 - 3-Agent 파이프라인)

#### Step 1: Agent 1에게 요청

**Agent 1에게:**
```
노이즈 필터링 강화 요구사항을 분석해줘.

현재 문제:
- "·", "320 해상도", "Last Update" 같은 노이즈가 finding으로 생성됨
- findings 수가 불필요하게 많음

분석해야 할 파일:
- packages/core-engine/src/rules.ts (reverseComparisonRule 함수)

분석 결과는 다음 파일에 저장해줘:
docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md
```

**Agent 1이 수행할 작업:**
- 문제점 분석
- 필터링이 필요한 노이즈 유형 분류
- 우선순위 결정
- 분석 결과 문서 작성

---

#### Step 2: Agent 2에게 요청 (Agent 1 완료 후)

**Agent 2에게:**
```
Agent 1의 분석 결과를 읽고 필터링 로직을 설계해줘.

참조 파일: docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md

설계 문서는 다음 파일에 저장해줘:
docs/agents/agent-2-design/design-docs/noise-filtering-design.md
```

**Agent 2가 수행할 작업:**
- Agent 1의 분석 결과 읽기
- 필터링 함수 설계
- 노이즈 패턴 정의
- 구현 가이드라인 작성

---

#### Step 3: Agent 3에게 요청 (Agent 2 완료 후)

**Agent 3에게:**
```
Agent 2의 설계를 읽고 코드를 구현하고 테스트해줘.

참조 파일: docs/agents/agent-2-design/design-docs/noise-filtering-design.md

테스트 결과는 다음 파일에 저장해줘:
docs/agents/agent-3-implementation/test-results/noise-filtering-test-report.md
```

**Agent 3이 수행할 작업:**
- Agent 2의 설계 문서 읽기
- 코드 구현
- 테스트 코드 작성
- 테스트 실행 및 검증
- 결과 리포트 작성

---

## 작업 흐름 체크리스트

### Agent 1 작업
- [ ] 문제점 분석 완료
- [ ] 요구사항 도출 완료
- [ ] 우선순위 결정 완료
- [ ] 분석 결과 문서 저장 완료

### Agent 2 작업
- [ ] Agent 1의 분석 결과 읽기 완료
- [ ] 코드 구조 설계 완료
- [ ] 인터페이스 정의 완료
- [ ] 설계 문서 저장 완료

### Agent 3 작업
- [ ] Agent 2의 설계 문서 읽기 완료
- [ ] 코드 구현 완료
- [ ] 테스트 코드 작성 완료
- [ ] 테스트 실행 및 검증 완료
- [ ] 결과 리포트 저장 완료

---

## 팁

### 1. 각 Agent의 역할 확인
- Agent 1: 분석만 수행 (코드 수정 안 함)
- Agent 2: 설계만 수행 (코드 수정 안 함)
- Agent 3: 구현 및 테스트 수행

### 2. 문서 경로 명확히 지정
각 Agent에게 정확한 파일 경로를 제공하세요:
```
docs/agents/agent-1-requirements/analysis-results/[작업명].md
docs/agents/agent-2-design/design-docs/[기능명]-design.md
docs/agents/agent-3-implementation/test-results/[기능명]-test-report.md
```

### 3. 순차적 진행
- Agent 1 완료 → Agent 2 시작
- Agent 2 완료 → Agent 3 시작
- 각 단계의 결과물을 확인하고 다음 단계로 진행

### 4. 필요시 피드백 루프
- Agent 3의 테스트 결과를 바탕으로 Agent 2에게 수정 요청 가능
- Agent 2의 설계를 바탕으로 Agent 1에게 재분석 요청 가능

---

## 다음 단계

이제 첫 작업을 시작할 수 있습니다!

**간단한 작업**이라면 → Agent 3에게 직접 요청
**복잡한 작업**이라면 → Agent 1부터 순차적으로 진행

질문이 있으면 언제든지 물어보세요!

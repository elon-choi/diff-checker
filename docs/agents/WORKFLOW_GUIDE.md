# 3-Agent 워크플로우 실행 가이드

## 빠른 시작

### 1단계: Agent 1에게 요구사항 분석 요청

**Agent 1에게 전달할 메시지:**
```
다음 작업을 분석해줘:

[작업 내용 설명]

분석 결과는 다음 파일에 저장해줘:
docs/agents/agent-1-requirements/analysis-results/[작업명].md
```

**Agent 1이 수행할 작업:**
1. 현재 코드베이스 분석
2. 문제점 파악
3. 요구사항 도출
4. 개선 방안 제시
5. 분석 결과 문서 작성

---

### 2단계: Agent 2에게 코드 설계 요청

**Agent 2에게 전달할 메시지:**
```
Agent 1의 분석 결과를 읽고 코드 설계를 해줘:

참조 파일: docs/agents/agent-1-requirements/analysis-results/[작업명].md

설계 문서는 다음 파일에 저장해줘:
docs/agents/agent-2-design/design-docs/[기능명]-design.md
```

**Agent 2가 수행할 작업:**
1. Agent 1의 분석 결과 읽기
2. 코드 구조 설계
3. 인터페이스 및 타입 정의
4. 구현 가이드라인 작성
5. 설계 문서 작성

---

### 3단계: Agent 3에게 구현 및 테스트 요청

**Agent 3에게 전달할 메시지:**
```
Agent 2의 설계 문서를 읽고 코드를 구현하고 테스트해줘:

참조 파일: docs/agents/agent-2-design/design-docs/[기능명]-design.md

테스트 결과는 다음 파일에 저장해줘:
docs/agents/agent-3-implementation/test-results/[기능명]-test-report.md
```

**Agent 3이 수행할 작업:**
1. Agent 2의 설계 문서 읽기
2. 코드 구현
3. 테스트 코드 작성
4. 테스트 실행 및 검증
5. 결과 리포트 작성

---

## 실제 예시: "노이즈 필터링 강화" 작업

### Agent 1 작업 예시

**요청:**
```
reverse.comparison 규칙에서 노이즈 텍스트가 finding으로 생성되는 문제를 분석해줘.

현재 문제:
- "·", "320 해상도", "Last Update" 같은 노이즈가 finding으로 생성됨
- findings 수가 불필요하게 많음

분석 결과는 다음 파일에 저장:
docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md
```

**Agent 1 출력:**
- 문제점 분석
- 필터링이 필요한 노이즈 유형 분류
- 우선순위 결정

### Agent 2 작업 예시

**요청:**
```
Agent 1의 분석 결과를 읽고 필터링 로직을 설계해줘.

참조: docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md

설계 문서: docs/agents/agent-2-design/design-docs/noise-filtering-design.md
```

**Agent 2 출력:**
- 필터링 함수 설계
- 노이즈 패턴 정의
- 구현 가이드라인

### Agent 3 작업 예시

**요청:**
```
Agent 2의 설계를 읽고 코드를 구현하고 테스트해줘.

참조: docs/agents/agent-2-design/design-docs/noise-filtering-design.md

테스트 결과: docs/agents/agent-3-implementation/test-results/noise-filtering-test-report.md
```

**Agent 3 출력:**
- 구현된 코드
- 테스트 코드
- 테스트 결과 리포트

---

## 병렬 처리 시나리오

여러 작업을 동시에 진행할 수 있습니다:

**Agent 1-1**: 작업 A 분석
**Agent 1-2**: 작업 B 분석
**Agent 2-1**: 작업 A 설계 (Agent 1-1 완료 후)
**Agent 2-2**: 작업 B 설계 (Agent 1-2 완료 후)
**Agent 3-1**: 작업 A 구현 (Agent 2-1 완료 후)
**Agent 3-2**: 작업 B 구현 (Agent 2-2 완료 후)

---

## 팁

1. **명확한 파일 경로 지정**: 각 에이전트에게 정확한 파일 경로를 제공하세요
2. **단계별 검증**: 각 단계가 완료되면 결과를 확인하고 다음 단계로 진행하세요
3. **문서화**: 모든 결과를 문서로 남겨 추적 가능하게 하세요
4. **피드백 루프**: Agent 3의 테스트 결과를 바탕으로 Agent 1이나 2에게 수정 요청 가능

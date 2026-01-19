# 3-Agent 아키텍처 설계

## 개요
요구사항 분석 → 코드 설계 → 구현 및 테스트의 3단계 파이프라인으로 작업을 분산 처리합니다.

## 디렉토리 구조

```
DiffChecker/
├── docs/
│   └── agents/
│       ├── ARCHITECTURE.md (이 파일)
│       ├── agent-1-requirements/  # Agent 1 작업 공간
│       │   ├── current-task.md
│       │   └── analysis-results/
│       ├── agent-2-design/        # Agent 2 작업 공간
│       │   ├── current-task.md
│       │   └── design-docs/
│       └── agent-3-implementation/ # Agent 3 작업 공간
│           ├── current-task.md
│           └── test-results/
```

## 에이전트 역할 정의

### Agent 1: 요구사항 분석 에이전트
**역할:**
- 현재 문제점 분석 및 요구사항 도출
- 개선 방안 제시
- 우선순위 결정

**입력:**
- 현재 코드베이스 상태
- 이슈/버그 리포트
- 사용자 요구사항

**출력:**
- `docs/agents/agent-1-requirements/analysis-results/[task-name].md`
- 요구사항 명세서
- 문제점 분석 리포트
- 개선 방안 제안서

**작업 프로세스:**
1. 문제 파악 (코드 분석, 이슈 확인)
2. 요구사항 도출
3. 우선순위 결정
4. 분석 결과 문서화

---

### Agent 2: 코드 설계 에이전트
**역할:**
- Agent 1의 분석 결과를 바탕으로 코드 설계
- 인터페이스 및 함수 시그니처 설계
- 알고리즘 및 로직 설계
- 설계 문서 작성

**입력:**
- `docs/agents/agent-1-requirements/analysis-results/*.md`
- 현재 코드베이스 구조

**출력:**
- `docs/agents/agent-2-design/design-docs/[feature-name]-design.md`
- 코드 구조 설계
- 인터페이스 정의
- 구현 가이드라인

**작업 프로세스:**
1. Agent 1의 분석 결과 읽기
2. 코드 구조 설계
3. 인터페이스 및 타입 정의
4. 구현 가이드라인 작성

---

### Agent 3: 구현 및 테스트 에이전트
**역할:**
- Agent 2의 설계를 바탕으로 실제 코드 구현
- 테스트 코드 작성
- 테스트 실행 및 검증
- 버그 수정 및 리팩토링

**입력:**
- `docs/agents/agent-2-design/design-docs/*.md`
- 현재 코드베이스

**출력:**
- 구현된 코드 파일
- 테스트 코드 파일
- `docs/agents/agent-3-implementation/test-results/[feature-name]-test-report.md`

**작업 프로세스:**
1. Agent 2의 설계 문서 읽기
2. 코드 구현
3. 테스트 코드 작성
4. 테스트 실행 및 검증
5. 결과 리포트 작성

## 워크플로우

```
[사용자 요구사항]
    ↓
[Agent 1: 요구사항 분석]
    ↓ (분석 결과 문서)
[Agent 2: 코드 설계]
    ↓ (설계 문서)
[Agent 3: 구현 및 테스트]
    ↓ (구현 코드 + 테스트 결과)
[최종 검증 및 통합]
```

## 공유 파일 형식

### 요구사항 분석 결과 형식
```markdown
# [작업명] 요구사항 분석

## 문제점
- 문제 1: ...
- 문제 2: ...

## 요구사항
1. 요구사항 1
2. 요구사항 2

## 우선순위
- High: ...
- Medium: ...
- Low: ...

## 개선 방안
- 방안 1: ...
- 방안 2: ...
```

### 설계 문서 형식
```markdown
# [기능명] 설계 문서

## 개요
...

## 인터페이스 정의
```typescript
interface XXX {
  ...
}
```

## 구현 가이드라인
1. 단계 1: ...
2. 단계 2: ...
```

### 테스트 결과 형식
```markdown
# [기능명] 테스트 결과

## 테스트 케이스
- [ ] 케이스 1: 통과/실패
- [ ] 케이스 2: 통과/실패

## 검증 결과
- 성공: ...
- 실패: ...

## 개선 사항
- ...
```

## 현재 작업 예시

### 작업: "reverse.comparison 규칙 노이즈 필터링 강화"

**Agent 1 출력:** `docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md`
**Agent 2 출력:** `docs/agents/agent-2-design/design-docs/noise-filtering-design.md`
**Agent 3 출력:** 구현 코드 + `docs/agents/agent-3-implementation/test-results/noise-filtering-test-report.md`

# 3-Agent 아키텍처

이 디렉토리는 3개의 에이전트가 협업하여 작업을 수행하는 구조를 제공합니다.

## 빠른 시작

1. **ARCHITECTURE.md** 읽기 - 전체 아키텍처 이해
2. **WORKFLOW_GUIDE.md** 읽기 - 실행 방법 학습
3. **EXAMPLE_TASK.md** 읽기 - 실제 예시 확인

## 디렉토리 구조

```
agents/
├── ARCHITECTURE.md              # 아키텍처 설계 문서
├── WORKFLOW_GUIDE.md            # 워크플로우 실행 가이드
├── EXAMPLE_TASK.md              # 실제 작업 예시
├── README.md                    # 이 파일
│
├── agent-1-requirements/        # Agent 1 작업 공간
│   ├── CURRENT_TASK_TEMPLATE.md # 작업 템플릿
│   └── analysis-results/        # 분석 결과 저장소
│
├── agent-2-design/              # Agent 2 작업 공간
│   ├── CURRENT_TASK_TEMPLATE.md # 작업 템플릿
│   └── design-docs/             # 설계 문서 저장소
│
└── agent-3-implementation/      # Agent 3 작업 공간
    ├── CURRENT_TASK_TEMPLATE.md # 작업 템플릿
    └── test-results/            # 테스트 결과 저장소
```

## 에이전트 역할

### Agent 1: 요구사항 분석
- 문제점 분석
- 요구사항 도출
- 개선 방안 제시

### Agent 2: 코드 설계
- 코드 구조 설계
- 인터페이스 정의
- 구현 가이드라인 작성

### Agent 3: 구현 및 테스트
- 코드 구현
- 테스트 작성
- 검증 및 리포트 작성

## 사용 방법

각 에이전트에게 작업을 요청할 때는 해당 디렉토리의 템플릿을 참고하세요.

자세한 내용은 **WORKFLOW_GUIDE.md**를 참조하세요.

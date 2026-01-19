# 빠른 시작: 3-Agent 생성하기

## 1단계: Agent 1 생성

1. Cursor Agents 탭에서 **"New Agent"** 클릭
2. Agent 이름: `Agent 1: 요구사항 분석`
3. 아래 파일의 내용을 복사하여 첫 메시지로 붙여넣기:

```
[agent-prompts/agent-1-requirements-prompt.txt 파일 내용 복사]
```

또는 직접 파일 열기:
```
docs/agents/agent-prompts/agent-1-requirements-prompt.txt
```

---

## 2단계: Agent 2 생성

1. Cursor Agents 탭에서 **"New Agent"** 클릭
2. Agent 이름: `Agent 2: 코드 설계`
3. 아래 파일의 내용을 복사하여 첫 메시지로 붙여넣기:

```
[agent-prompts/agent-2-design-prompt.txt 파일 내용 복사]
```

또는 직접 파일 열기:
```
docs/agents/agent-prompts/agent-2-design-prompt.txt
```

---

## 3단계: Agent 3 생성

1. Cursor Agents 탭에서 **"New Agent"** 클릭
2. Agent 이름: `Agent 3: 구현 및 테스트`
3. 아래 파일의 내용을 복사하여 첫 메시지로 붙여넣기:

```
[agent-prompts/agent-3-implementation-prompt.txt 파일 내용 복사]
```

또는 직접 파일 열기:
```
docs/agents/agent-prompts/agent-3-implementation-prompt.txt
```

---

## 완료 확인

Agents 탭에서 다음 3개가 보여야 합니다:
- ✅ Agent 1: 요구사항 분석
- ✅ Agent 2: 코드 설계
- ✅ Agent 3: 구현 및 테스트

---

## 사용 방법

### Agent 1에게 요청:
```
[작업 내용]을 분석해줘.
결과는 docs/agents/agent-1-requirements/analysis-results/[작업명].md에 저장해줘.
```

### Agent 2에게 요청 (Agent 1 완료 후):
```
Agent 1의 분석 결과를 읽고 설계해줘.
참조: docs/agents/agent-1-requirements/analysis-results/[작업명].md
결과는 docs/agents/agent-2-design/design-docs/[기능명]-design.md에 저장해줘.
```

### Agent 3에게 요청 (Agent 2 완료 후):
```
Agent 2의 설계를 읽고 구현하고 테스트해줘.
참조: docs/agents/agent-2-design/design-docs/[기능명]-design.md
테스트 결과는 docs/agents/agent-3-implementation/test-results/[기능명]-test-report.md에 저장해줘.
```

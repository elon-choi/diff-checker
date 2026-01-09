# LLM Adapter

Diff Checker의 LLM Adapter는 규칙 기반으로 생성된 findings를 LLM을 사용하여 후처리하는 기능을 제공합니다.

## 기능

1. **의미 동치 판단**: 유사한 텍스트가 실제로 같은 의미인지 판단하여 불필요한 findings 제거
2. **Finding 병합**: 중복되거나 유사한 findings를 자동으로 병합
3. **설명 개선**: Finding의 description을 더 명확하고 구체적으로 개선

## 사용 방법

### 환경 변수 설정

LLM Adapter를 사용하려면 다음 환경 변수를 설정하세요:

```bash
# LLM 사용 활성화 (필수)
LLM_ENABLED=true

# LLM Provider 선택 (openai, anthropic, none)
LLM_PROVIDER=openai

# API 키 (필수)
LLM_API_KEY=your-api-key-here

# 모델명 (선택, 기본값 사용)
LLM_MODEL=gpt-4o-mini
```

### 지원하는 Provider

- **OpenAI**: `LLM_PROVIDER=openai`
  - 기본 모델: `gpt-4o-mini`
  - 지원 모델: `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo` 등

- **Anthropic**: `LLM_PROVIDER=anthropic`
  - 기본 모델: `claude-3-haiku-20240307`
  - 지원 모델: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku` 등

- **비활성화**: `LLM_PROVIDER=none` 또는 `LLM_ENABLED`를 설정하지 않음
  - LLM을 사용하지 않고 기본 병합 로직만 사용

### 기본 동작 (LLM 비활성화 시)

LLM이 비활성화되어 있거나 API 키가 없는 경우, 기본 병합 로직이 실행됩니다:
- 유사도 70% 이상인 findings를 자동 병합
- 같은 category와 severity를 가진 findings만 병합

### 예시

```typescript
import { LLMAdapter } from '@diff-checker/llm-adapter';

const findings = await LLMAdapter.refine(
  rawFindings,
  documents,
  specItems
);
```

## 주의사항

1. LLM API 호출은 비용이 발생할 수 있습니다
2. API 호출 실패 시 기본 병합 로직으로 자동 fallback됩니다
3. 대량의 findings가 있는 경우 처리 시간이 길어질 수 있습니다
4. API 키는 환경 변수로 관리하고 절대 코드에 하드코딩하지 마세요



# 예시 작업: 노이즈 필터링 강화

이 문서는 3-Agent 아키텍처를 사용한 실제 작업 예시입니다.

## 작업 개요
- **작업명**: reverse.comparison 규칙 노이즈 필터링 강화
- **목표**: 불필요한 노이즈 텍스트가 finding으로 생성되지 않도록 필터링 강화

---

## Agent 1: 요구사항 분석

### 작업 요청 (사용자 → Agent 1)

```
reverse.comparison 규칙에서 노이즈 텍스트가 finding으로 생성되는 문제를 분석해줘.

현재 문제:
- "·", "320 해상도", "Last Update / 2025.11.06" 같은 노이즈가 finding으로 생성됨
- "보유 유료 이용권 및 유료 캐시 미노출", "탈퇴 버튼 - 비활성화" 같은 상태 라벨도 finding으로 생성됨
- findings 수가 불필요하게 많아서 실제 문제를 찾기 어려움

분석해야 할 파일:
- packages/core-engine/src/rules.ts (reverseComparisonRule 함수)

분석 결과는 다음 파일에 저장:
docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md
```

### Agent 1 출력 예시

**파일**: `docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md`

```markdown
# 노이즈 필터링 강화 요구사항 분석

## 문제점 분석

### 현재 상황
- reverse.comparison 규칙에서 8개의 findings 생성
- 그 중 3개는 노이즈 (·, 320 해상도, Last Update 등)
- 상태 라벨도 finding으로 생성됨

### 문제점
1. 특수 문자만 있는 텍스트 ("·", "-", "." 등)
2. 숫자만 있는 텍스트 ("320", "2025" 등)
3. 해상도 라벨 ("320 해상도", "320px" 등)
4. 메타데이터 라벨 ("Last Update", "업데이트", "날짜" 등)
5. 상태 라벨 ("비활성화", "활성화", "미노출", "노출" 등)

## 요구사항

### 필수 요구사항
1. 특수 문자만 있는 텍스트는 finding 생성하지 않음
2. 숫자만 있는 텍스트는 finding 생성하지 않음
3. 해상도 라벨은 finding 생성하지 않음
4. 메타데이터 라벨은 finding 생성하지 않음
5. 상태 라벨은 finding 생성하지 않음

### 우선순위
- **High**: 특수 문자, 숫자만 있는 텍스트 필터링
- **High**: 해상도 라벨 필터링
- **Medium**: 메타데이터 라벨 필터링
- **Medium**: 상태 라벨 필터링

## 개선 방안

### 방안 1: 필터링 로직 추가
- reverseComparisonRule 함수 시작 부분에 필터링 로직 추가
- 각 노이즈 유형별로 체크하고 continue로 건너뛰기

### 방안 2: 정규식 패턴 활용
- 해상도 라벨: `/(^\d{3,4}\s*해상도$)|(\b해상도\b)|(^\d{3,4}\s*px$)/i`
- 메타데이터 라벨: `/^(last\s*update|업데이트|update\s*date|날짜|date|버전|version)/i`
- 상태 라벨: `/(비활성화|활성화|미노출|노출|비활성|활성|disabled|enabled|hidden|visible)$/i`

## 다음 단계
- [x] Agent 2에게 설계 요청
```

---

## Agent 2: 코드 설계

### 작업 요청 (Agent 1 완료 후 → Agent 2)

```
Agent 1의 분석 결과를 읽고 필터링 로직을 설계해줘.

참조 파일: docs/agents/agent-1-requirements/analysis-results/noise-filtering-improvement.md

설계 문서는 다음 파일에 저장:
docs/agents/agent-2-design/design-docs/noise-filtering-design.md
```

### Agent 2 출력 예시

**파일**: `docs/agents/agent-2-design/design-docs/noise-filtering-design.md`

```markdown
# 노이즈 필터링 설계 문서

## 개요
reverse.comparison 규칙에서 노이즈 텍스트를 필터링하는 로직을 추가합니다.

## 설계

### 필터링 위치
- `packages/core-engine/src/rules.ts`
- `reverseComparisonRule` 함수 내부
- `for (const figmaNode of figmaDoc.nodes)` 루프 시작 부분

### 필터링 로직 순서

1. **기본 검증** (기존)
   - TEXT 노드 확인
   - visible 확인
   - 텍스트 길이 확인

2. **특수 문자 필터링** (신규)
   ```typescript
   const trimmedText = figmaText.trim();
   if (trimmedText.length <= 2 && /^[·•\-\.,;:!?()\[\]{}'"`~@#$%^&*+=|\\/<>_]+$/.test(trimmedText)) {
     continue;
   }
   ```

3. **숫자만 있는 텍스트 필터링** (신규)
   ```typescript
   if (/^\d+$/.test(trimmedText)) {
     continue;
   }
   ```

4. **해상도 라벨 필터링** (신규)
   ```typescript
   const isResolutionLabel = /(^\d{3,4}\s*해상도$)|(\b해상도\b)|(^\d{3,4}\s*px$)|(^\d{3,4}\s*resolution$)/i.test(normalizedFigmaText);
   if (isResolutionLabel) {
     continue;
   }
   ```

5. **메타데이터 라벨 필터링** (신규)
   ```typescript
   const isMetadataLabel = /^(last\s*update|업데이트|update\s*date|날짜|date|버전|version)/i.test(normalizedFigmaText);
   if (isMetadataLabel) {
     continue;
   }
   ```

6. **상태 라벨 필터링** (신규)
   ```typescript
   const isStateLabel = /(비활성화|활성화|미노출|노출|비활성|활성|disabled|enabled|hidden|visible)$/i.test(normalizedFigmaText);
   if (isStateLabel) {
     continue;
   }
   ```

## 구현 가이드라인

### 단계 1: 특수 문자 및 숫자 필터링 추가
- `normalizedFigmaText` 계산 전에 추가
- `trimmedText` 변수 사용

### 단계 2: 라벨 필터링 추가
- `normalizedFigmaText` 계산 후에 추가
- 기존 `isAnnotation` 체크 전에 추가
- `continue`로 finding 생성 건너뛰기

### 단계 3: 기존 로직과 통합
- 기존 필터링 로직과 충돌하지 않도록 주의
- 순서 중요: 기본 검증 → 특수 문자/숫자 → 라벨 체크 → 기존 로직

## 주의사항
- 필터링 순서가 중요함 (빠른 필터링을 위해 간단한 체크를 먼저)
- `normalizedFigmaText`는 라벨 체크에만 사용
- `trimmedText`는 특수 문자/숫자 체크에 사용

## 다음 단계
- [x] Agent 3에게 구현 요청
```

---

## Agent 3: 구현 및 테스트

### 작업 요청 (Agent 2 완료 후 → Agent 3)

```
Agent 2의 설계를 읽고 코드를 구현하고 테스트해줘.

참조 파일: docs/agents/agent-2-design/design-docs/noise-filtering-design.md

테스트 결과는 다음 파일에 저장:
docs/agents/agent-3-implementation/test-results/noise-filtering-test-report.md
```

### Agent 3 출력 예시

**파일**: `docs/agents/agent-3-implementation/test-results/noise-filtering-test-report.md`

```markdown
# 노이즈 필터링 테스트 결과

## 구현된 파일
- `packages/core-engine/src/rules.ts` (수정)

## 구현 내용
- 특수 문자만 있는 텍스트 필터링 추가
- 숫자만 있는 텍스트 필터링 추가
- 해상도 라벨 필터링 추가
- 메타데이터 라벨 필터링 추가
- 상태 라벨 필터링 추가

## 테스트 케이스

### 테스트 데이터
```json
{
  "figmaJson": [
    {"Content": "·"},
    {"Content": "320 해상도"},
    {"Content": "Last Update / 2025.11.06"},
    {"Content": "보유 유료 이용권 및 유료 캐시 미노출"},
    {"Content": "탈퇴 버튼 - 비활성화"},
    {"Content": "서비스 탈퇴"},
    {"Content": "카카오웹툰 탈퇴하기"}
  ]
}
```

### 테스트 결과
- [x] "·" 필터링: 통과 (finding 생성 안 됨)
- [x] "320 해상도" 필터링: 통과 (finding 생성 안 됨)
- [x] "Last Update / 2025.11.06" 필터링: 통과 (finding 생성 안 됨)
- [x] "보유 유료 이용권 및 유료 캐시 미노출" 필터링: 통과 (finding 생성 안 됨)
- [x] "탈퇴 버튼 - 비활성화" 필터링: 통과 (finding 생성 안 됨)
- [x] "서비스 탈퇴" 유지: 통과 (finding 생성됨)
- [x] "카카오웹툰 탈퇴하기" 유지: 통과 (finding 생성됨)

## 검증 결과

### Before (개선 전)
- 총 findings: 8개
- 노이즈 포함: 3개

### After (개선 후)
- 총 findings: 5개
- 노이즈 제거: 3개 제거됨

### 성공 기준
- ✅ 노이즈 텍스트가 finding으로 생성되지 않음
- ✅ 실제 UI 텍스트는 정상적으로 finding 생성됨
- ✅ Findings 수가 8개에서 5개로 감소

## 개선 사항
- 모든 테스트 케이스 통과
- 코드 리뷰 필요 없음
- 바로 통합 가능

## 다음 단계
- [x] 완료 및 통합
```

---

## 전체 워크플로우 요약

1. **Agent 1**: 문제 분석 → 요구사항 도출
2. **Agent 2**: 설계 문서 작성 → 구현 가이드라인 제공
3. **Agent 3**: 코드 구현 → 테스트 → 검증

**결과**: 8개 findings → 5개 findings (노이즈 3개 제거)

# LLM Diff 비교 프롬프트

## 사용되는 프롬프트

LLM 기반 diff 비교에서 사용되는 실제 프롬프트입니다.

### 프롬프트 내용

```
한국어 UI/UX 요구사항과 디자인 텍스트를 비교해주세요.

**요구사항 (Spec):**
텍스트: "{specItem.text}"
컨텍스트: {specItem.sectionPath || specItem.meta?.section || '없음'}
의도: {specItem.intent || 'UI 텍스트 표시'}
기능: {specItem.meta?.feature || '없음'}

**디자인 (Figma):**
텍스트: "{figmaNode.text}"
위치: {figmaNode.figmaPath || figmaNode.path || '없음'}
레이어명: {figmaNode.name || '없음'}

**한국어 특수 고려사항:**
1. 띄어쓰기 차이 허용: "인기순" = "인기 순" = "인기순위"
2. 조사 변형 허용: "삭제" = "삭제하기" = "삭제하세요"
3. 존댓말 차이 허용: "확인" = "확인하세요" = "확인해주세요"
4. 약어 허용: "인기순" = "인기 순위"
5. 동의어 구분: "삭제" ≠ "제거" (의미가 다를 수 있음)

**비교 기준:**
- EXACT: 완전히 동일
- SEMANTIC: 의미적으로 동일 (띄어쓰기, 조사만 다름)
- SIMILAR: 유사하지만 약간 다름
- MISMATCH: 의미가 다름
- MISSING: Spec에 있지만 Figma에 없음 (이 경우는 비교 대상이 없으므로 발생하지 않음)
- EXTRA: Figma에 있지만 Spec에 없음 (이 경우는 비교 대상이 없으므로 발생하지 않음)

**심각도 판단 기준:**
- CRITICAL: 핵심 기능이 누락되거나 완전히 잘못됨 (예: "삭제" vs "추가")
- MAJOR: 중요한 텍스트가 다르거나 누락됨 (예: "인기순" vs "최신순")
- MINOR: 표현만 다르지만 의미는 동일 (예: "인기순" vs "인기 순")
- INFO: 미미한 차이 또는 스타일 차이
- NONE: 차이 없음

**응답 형식 (JSON만 반환, 다른 설명 없이):**
{
  "match": true/false,
  "matchType": "EXACT" | "SEMANTIC" | "SIMILAR" | "MISMATCH",
  "confidence": 0.0-1.0,
  "reason": "판단 이유 (한국어 특성을 고려한 설명)",
  "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | "NONE",
  "koreanVariations": ["동일한 의미의 변형들"],
  "suggestion": "개선 제안 (있는 경우)"
}
```

## 프롬프트 특징

### 1. 한국어 특화
- 띄어쓰기 차이 허용
- 조사 변형 허용
- 존댓말 차이 허용
- 약어 허용
- 동의어 구분

### 2. 컨텍스트 활용
- SpecItem의 섹션, 의도, 기능 정보 활용
- FigmaNode의 위치, 레이어명 정보 활용

### 3. 의미적 비교 우선
- 정확한 텍스트 매칭보다 의미적 동일성 우선
- SEMANTIC 매칭으로 한국어 특성 반영

### 4. 심각도 판단
- CRITICAL: 핵심 기능 오류
- MAJOR: 중요한 차이
- MINOR: 표현 차이
- INFO: 미미한 차이
- NONE: 차이 없음

## 작동 방식

1. **규칙 기반 1차 비교**: 기존 규칙으로 finding 생성
2. **불확실한 항목 필터링**: 유사도가 낮거나 MISMATCH인 항목만 선별
3. **LLM 재검증**: 선별된 항목을 LLM으로 재검증
4. **결과 반영**: LLM 결과에 따라 finding 업데이트 또는 제거

## 비용 최적화

- 불확실한 항목만 LLM 검증 (전체의 10-20%)
- 배치 처리로 API 호출 최소화
- 규칙 기반 결과와 병행 사용

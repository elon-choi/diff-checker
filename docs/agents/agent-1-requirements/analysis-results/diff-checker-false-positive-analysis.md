# Diff Checker False Positive 문제 분석 및 요구사항 도출

## 작업 정보
- **작업명**: Diff Checker False Positive 문제 분석
- **분석 일시**: 2025-01-05
- **분석자**: Agent 1 (요구사항 분석 전문가)

---

## 1. 문제점 분석

### 1.1 현재 상황

**발생 현상**:
- Diff 결과가 14,778건으로 비정상적으로 많음
- 대부분이 메타데이터 및 설명 텍스트로 인한 False Positive
- 실제 UI 차이는 수십 건 내외로 추정되나, 노이즈에 묻혀 파악 어려움

**심각도 분포**:
- CRITICAL: 75건
- MAJOR: 14,687건 (대부분 메타데이터/설명 텍스트)
- MINOR: 16건

**프로젝트 헌장 위반**:
- ❌ Diff 결과가 많을수록 좋다고 판단 (실패 기준)
- ❌ 디자이너 가이드 텍스트가 Diff에 포함됨 (실패 기준)
- ❌ QA가 결과를 보고 "그래서 뭘 보라는 거지?"라고 느끼는 경우 (실패 기준)

**목표 달성 기준**:
- ✅ Diff 결과가 **수십 건 이내**
- ✅ QA가 보고 즉시 "이건 무시" / "이건 확인 필요"를 구분할 수 있음

---

### 1.2 근본 원인 분석

#### 원인 1: FigmaNormalizer의 과도한 추출 (부분 해결됨)

**현재 상태**:
- ✅ TEXT 노드만 추출하도록 개선됨 (`packages/normalizers/figma-normalizer/src/index.ts:108`)
- ✅ visible이 false인 노드는 제외됨 (`packages/normalizers/figma-normalizer/src/index.ts:113`)
- ✅ 디자이너 가이드 텍스트 필터링 구현됨 (`packages/normalizers/figma-normalizer/src/index.ts:35-104`)

**남은 문제점**:
- 디자이너 가이드 텍스트 필터링 패턴이 완벽하지 않을 수 있음
- 새로운 형식의 메타데이터가 추가될 경우 패턴 업데이트 필요
- 텍스트 크기 기반 필터링 (10px 미만)이 충분하지 않을 수 있음

**영향**:
- 비교 대상: ~500-1000개 → ~50-100개로 감소 (90% 감소)
- 하지만 여전히 일부 False Positive 발생 가능

#### 원인 2: SpecNormalizer의 과도한 추출 (미해결)

**현재 상태**:
- ❌ 모든 줄을 그대로 UUMNode로 변환 (`packages/normalizers/spec-normalizer/src/index.ts:90-108`)
- ❌ 필터링 없음 (필터링은 `deriveSpecItemsFromMarkdown`에서만 수행)
- ❌ `reverseComparisonRule`에서는 `specDoc.nodes`를 직접 사용하여 모든 줄이 비교 대상에 포함됨

**문제점**:
```typescript
// 현재 구현: 모든 줄을 그대로 변환
const nodes: UUMNode[] = lines.map((line, idx) => ({
  uid: `spec-${idx}`,
  platform: 'SPEC',
  text: parsed.text,  // 모든 줄을 그대로 포함
  role: 'TEXT',
  // ...
}));
```

**영향**:
- Spec 줄 수: 수백 줄
- 실제 UI 텍스트: 수십 개
- 비교 대상: 수백 줄 (과도함)
- False Positive: 설명 텍스트, 메타데이터가 비교 대상에 포함됨

#### 원인 3: reverseComparisonRule의 문제 (부분 해결됨)

**현재 상태**:
- ✅ TEXT 노드만 확인하도록 개선됨 (`packages/core-engine/src/rules.ts:1216`)
- ✅ visible이 false인 노드는 제외됨 (`packages/core-engine/src/rules.ts:1221`)
- ✅ SpecItems 기반 비교로 변경됨 (`packages/core-engine/src/rules.ts:1191-1192`)
- ✅ 다양한 필터링 규칙 추가됨 (메타데이터, 해상도 라벨, 상태 라벨 등)

**남은 문제점**:
- Spec 전체 텍스트를 하나의 문자열로 합쳐서 키워드 매칭 사용 (`packages/core-engine/src/rules.ts:1196-1202`)
- 키워드 매칭이 너무 느슨할 수 있음
- 예: "필터"가 "필터 버튼을 클릭하면"에 포함되면 매칭됨 (의도된 동작이지만, 더 정확한 매칭 필요)

**영향**:
- 비교 대상: ~500-1000개 → ~50-100개로 감소
- False Positive: ~80-90% → ~10-20%로 감소 (예상)
- 하지만 여전히 개선 여지 있음

#### 원인 4: deriveSpecItemsFromMarkdown의 불완전한 필터링

**현재 상태**:
- ✅ 메타데이터 패턴 제외 (부분적)
- ✅ 50자 이상 긴 문장 제외 (UI 키워드 없으면)
- ✅ 20자 이하만 포함

**문제점**:
- 패턴 기반 필터링은 한계가 있음
- 새로운 메타데이터 형식 추가 시 패턴 업데이트 필요
- UI 키워드가 없는 실제 UI 텍스트도 제외될 수 있음

**영향**:
- False Positive: ~30-40% 감소 (예상)
- 하지만 완벽한 필터링 불가능

---

### 1.3 영향 범위

**직접 영향**:
- Diff 결과의 정확도 저하
- 실제 차이 파악 어려움
- QA 작업 효율성 저하

**간접 영향**:
- False Positive 증가로 실제 차이 파악 어려움
- 사용자 신뢰도 하락
- 결과 해석 시간 증가
- 프로젝트 헌장 위반 (목적 달성 실패)

**비즈니스 영향**:
- QA 작업 시간 증가
- 버그 발견률 저하 (중요한 차이가 노이즈에 묻힘)
- 프로젝트 품질 저하

---

## 2. 요구사항 도출

### 2.1 핵심 요구사항

#### REQ-1: SpecNormalizer 필터링 강화
**우선순위**: High

**요구사항**:
- SpecNormalizer에서 메타데이터 및 설명 텍스트를 필터링해야 함
- `deriveSpecItemsFromMarkdown`의 필터링 로직을 SpecNormalizer로 이동 또는 통합
- `reverseComparisonRule`에서 `specDoc.nodes` 대신 `specItems`만 사용하도록 보장

**수용 기준**:
- SpecNormalizer가 필터링된 노드만 반환
- `reverseComparisonRule`에서 사용하는 Spec 텍스트가 필터링된 항목만 포함
- False Positive 50% 이상 감소

**관련 파일**:
- `packages/normalizers/spec-normalizer/src/index.ts`
- `packages/core-engine/src/rules.ts` (reverseComparisonRule)

---

#### REQ-2: FigmaNormalizer 필터링 패턴 확장
**우선순위**: Medium

**요구사항**:
- 디자이너 가이드 텍스트 필터링 패턴 확장
- 새로운 메타데이터 형식 대응
- 텍스트 크기 기반 필터링 강화 (10px → 5px 또는 가변 임계값)

**수용 기준**:
- 새로운 메타데이터 형식이 추가되어도 False Positive 발생하지 않음
- 텍스트 크기 기반 필터링이 더 정확하게 작동
- False Positive 10% 이상 추가 감소

**관련 파일**:
- `packages/normalizers/figma-normalizer/src/index.ts`

---

#### REQ-3: reverseComparisonRule 매칭 정확도 향상
**우선순위**: Medium

**요구사항**:
- Spec 전체 텍스트를 하나의 문자열로 합치는 대신, SpecItems 기반 정확한 매칭 사용
- 키워드 부분 매칭 대신 의미 기반 매칭 고려 (LLM 활용 또는 개선된 알고리즘)
- 매칭 실패 시 유사도 기반 후보 제시 개선

**수용 기준**:
- SpecItems 기반 정확한 매칭이 우선적으로 사용됨
- 키워드 부분 매칭의 False Positive 감소
- 매칭 후보 제시가 더 정확함

**관련 파일**:
- `packages/core-engine/src/rules.ts` (reverseComparisonRule)

---

#### REQ-4: 노이즈 필터링 통합 및 강화
**우선순위**: Medium

**요구사항**:
- `noise-filter.ts`의 필터링 로직을 Normalizer에 통합
- 일관된 필터링 규칙 적용
- 필터링 규칙의 중앙 관리

**수용 기준**:
- 모든 Normalizer에서 동일한 필터링 규칙 적용
- 필터링 규칙이 한 곳에서 관리됨
- False Positive 5% 이상 추가 감소

**관련 파일**:
- `apps/diff-checker/lib/noise-filter.ts`
- `packages/normalizers/*/src/index.ts`

---

### 2.2 개선 방안

#### 방안 1: SpecNormalizer 필터링 통합 (즉시 적용 가능)
**우선순위**: High

**구현 내용**:
1. `deriveSpecItemsFromMarkdown`의 필터링 로직을 SpecNormalizer로 이동
2. SpecNormalizer가 필터링된 노드만 반환하도록 수정
3. `reverseComparisonRule`에서 `specDoc.nodes` 대신 `specItems`만 사용

**장점**:
- 즉시 적용 가능
- False Positive 대폭 감소 예상 (50% 이상)
- 코드 일관성 향상

**단점**:
- SpecNormalizer의 책임 증가
- 기존 코드 수정 필요

**예상 효과**:
- False Positive: ~50% 감소
- 비교 대상: 수백 줄 → 수십 개

---

#### 방안 2: 필터링 규칙 중앙 관리 (단기 적용)
**우선순위**: Medium

**구현 내용**:
1. 필터링 규칙을 별도 모듈로 분리 (`packages/core-engine/src/filters.ts`)
2. 모든 Normalizer에서 공통 필터링 모듈 사용
3. 필터링 규칙의 확장성 향상

**장점**:
- 필터링 규칙의 일관성 보장
- 유지보수 용이
- 새로운 필터링 규칙 추가 용이

**단점**:
- 리팩토링 필요
- 기존 코드 수정 필요

**예상 효과**:
- False Positive: ~10% 추가 감소
- 코드 품질 향상

---

#### 방안 3: LLM 활용 자동 추출 (중기 검토)
**우선순위**: Low

**구현 내용**:
1. LLM을 활용한 Spec 텍스트 자동 추출
2. 의미 기반 매칭
3. 동의어 처리

**장점**:
- 자연어 Spec에서도 자동 추출 가능
- 의미 기반 매칭으로 정확도 향상
- 동의어 처리 가능

**단점**:
- LLM 비용 및 지연 시간
- 추출 정확도 의존
- API 키 필요

**예상 효과**:
- False Positive: ~20% 추가 감소
- 정확도 향상

---

## 3. 우선순위 결정

### High Priority (즉시 적용 필요)

1. **REQ-1: SpecNormalizer 필터링 강화**
   - 영향도: 매우 높음 (False Positive 50% 이상 감소 예상)
   - 구현 난이도: 중간
   - 비용: 낮음
   - **권장**: 즉시 적용

### Medium Priority (단기 적용)

2. **REQ-2: FigmaNormalizer 필터링 패턴 확장**
   - 영향도: 중간 (False Positive 10% 추가 감소 예상)
   - 구현 난이도: 낮음
   - 비용: 낮음
   - **권장**: REQ-1 완료 후 적용

3. **REQ-3: reverseComparisonRule 매칭 정확도 향상**
   - 영향도: 중간 (False Positive 5% 추가 감소 예상)
   - 구현 난이도: 중간
   - 비용: 낮음
   - **권장**: REQ-1 완료 후 적용

4. **REQ-4: 노이즈 필터링 통합 및 강화**
   - 영향도: 중간 (False Positive 5% 추가 감소 예상)
   - 구현 난이도: 중간
   - 비용: 낮음
   - **권장**: REQ-1 완료 후 적용

### Low Priority (중기 검토)

5. **LLM 활용 자동 추출**
   - 영향도: 높음 (False Positive 20% 추가 감소 예상)
   - 구현 난이도: 높음
   - 비용: 높음 (LLM API 비용)
   - **권장**: 단기 개선 완료 후 검토

---

## 4. 개선 방안 제시

### 4.1 단계별 개선 계획

#### Phase 1: 즉시 적용 (1-2일)
1. SpecNormalizer 필터링 강화 (REQ-1)
   - `deriveSpecItemsFromMarkdown`의 필터링 로직을 SpecNormalizer로 이동
   - `reverseComparisonRule`에서 `specItems`만 사용하도록 수정
   - 테스트 및 검증

**예상 효과**:
- False Positive: 14,778건 → ~7,000건 (50% 감소)
- 비교 대상: 수백 줄 → 수십 개

#### Phase 2: 단기 개선 (3-5일)
2. FigmaNormalizer 필터링 패턴 확장 (REQ-2)
3. reverseComparisonRule 매칭 정확도 향상 (REQ-3)
4. 노이즈 필터링 통합 및 강화 (REQ-4)

**예상 효과**:
- False Positive: ~7,000건 → ~3,000건 (추가 57% 감소)
- 비교 대상: 수십 개 → 수십 개 (유지)

#### Phase 3: 중기 검토 (1-2주)
5. LLM 활용 자동 추출 검토 및 구현

**예상 효과**:
- False Positive: ~3,000건 → ~1,000건 (추가 67% 감소)
- 목표 달성: 수십 건 ~ 수백 건

---

### 4.2 최종 목표

**목표 지표**:
- Diff 결과: **수십 건 ~ 수백 건** (현재: 14,778건)
- False Positive 비율: **10% 이하** (현재: ~90%)
- QA 판단 가능한 결과: **90% 이상**

**성공 기준**:
- ✅ Diff 결과가 수십 건 이내
- ✅ QA가 보고 즉시 "이건 무시" / "이건 확인 필요"를 구분할 수 있음
- ✅ 디자이너 가이드 텍스트가 Diff에 포함되지 않음
- ✅ 프로젝트 헌장 준수

---

## 5. 결론

### 현재 상태 요약

**주요 문제점**:
1. SpecNormalizer가 모든 줄을 비교 대상에 포함 (미해결)
2. FigmaNormalizer는 이미 개선됨 (부분 해결)
3. reverseComparisonRule은 이미 개선됨 (부분 해결)
4. 필터링 규칙이 분산되어 있음 (미해결)

**해결 방안**:
1. SpecNormalizer 필터링 강화 (High Priority)
2. 필터링 규칙 통합 및 강화 (Medium Priority)
3. LLM 활용 자동 추출 검토 (Low Priority)

### 권장 사항

**즉시 적용**:
- REQ-1: SpecNormalizer 필터링 강화
- 예상 효과: False Positive 50% 이상 감소

**단기 적용**:
- REQ-2, REQ-3, REQ-4: 추가 필터링 강화
- 예상 효과: False Positive 추가 30% 감소

**중기 검토**:
- LLM 활용 자동 추출
- 예상 효과: False Positive 추가 20% 감소

### 다음 단계

1. **Agent 2 (코드 설계 에이전트)에게 전달**
   - REQ-1의 상세 설계 요청
   - SpecNormalizer 필터링 통합 설계
   - `reverseComparisonRule` 수정 설계

2. **Agent 3 (구현 및 테스트 에이전트)에게 전달**
   - 구현 완료 후 테스트 실행
   - False Positive 감소율 검증
   - 회귀 테스트 수행

---

## 부록: 관련 문서

- [프로젝트 헌장](./PROJECT_CONSTITUTION.md)
- [QA 구현 가이드](./QA_IMPLEMENTATION_GUIDE.md)
- [근본 원인 분석](./ROOT_CAUSE_ANALYSIS.md)
- [이슈 분석 (2025-01-04)](./ISSUE_ANALYSIS_20250104.md)


# Diff Checker 프로젝트 지침서 (Guideline v1)

## 0. 프로젝트 헌장 (최상위 규칙 - 절대 위반 금지)

### 0.1 절대적 목적

이 프로젝트의 목적은 단 하나다.

> **QA가 '추가 확인이 필요한 요구사항'을 빠르게 식별하도록 돕는 것**

이 프로젝트는:
- ❌ 문서 비교 도구가 아니다
- ❌ 문자열 Diff 도구가 아니다
- ❌ 결함을 자동 판정하는 도구가 아니다

### 0.2 성공 / 실패 기준

#### ❌ 실패
- Diff 결과가 많을수록 좋다고 판단
- TEXT_MISMATCH, MISSING_ELEMENT 다수 발생
- 디자이너 가이드 텍스트가 Diff에 포함됨
- QA가 결과를 보고 "그래서 뭘 보라는 거지?"라고 느끼는 경우

#### ✅ 성공
- Diff 결과가 **수십 건 이내**
- QA가 보고 즉시
  - "이건 무시"
  - "이건 확인 필요"
  를 구분할 수 있음

### 0.3 Diff의 단위 (가장 중요)

#### ❌ 금지된 비교 단위
- TEXT ↔ TEXT
- 문자열 유사도 기반 비교
- Figma 레이어 이름(name)
- 노드 단위 비교

#### ✅ 허용된 비교 단위
- REQUIREMENT (요구사항)
- 정책 / 조건 / 사용자에게 보장되어야 하는 행동

### 0.4 Figma 처리 절대 규칙

#### 비교 대상
- `node.type === TEXT`
- `node.characters` (실제 화면에 표시되는 텍스트)

#### 아래 항목이 Diff에 나오면 구현 실패
- 해상도 / 사이즈 설명 (예: 583 * 300)
- 폰트 크기 / 디자인 가이드
- Copy 가능 / Text / Text + Image
- 더미 텍스트 (일이삼사…, Lorem ipsum)
- 날짜 / 버전 메모
- Frame / Component / Group / Document 같은 레이어 이름

👉 위 항목은 **요구사항이 아니다.**

### 0.5 Spec 해석 규칙

#### Spec은 문서가 아니다
Spec 전체 텍스트를 그대로 비교하는 행위는 금지한다.

Spec은 반드시 다음 구조로 해석되어야 한다:

```ts
RequirementItem {
  id: string
  intent: string            // 무엇을 보장해야 하는가
  type: 'UI_TEXT' | 'VISIBILITY' | 'POLICY'
  expected: string | boolean
  scope?: string
}
```

---

## 1. 목적
Spec – Figma – Web – Android – iOS 간의 UI/정책/문구 일관성을 자동 검증하기 위한 Diff Checker 시스템을 구성한다.

**단, 이 목적은 0번 섹션(프로젝트 헌장)의 절대적 목적에 종속된다.**

## 2. 전체 구조 원칙
- 단방향 흐름: UI → API → Normalizer → UUM → Diff Engine → Reporter  
- 확장 가능한 Phase 구조: Phase 1~4  
- 플랫폼별 Normalizer는 독립 설계  
- UUM(Unified UI Model)은 모든 비교의 기준

## 3. 개발 원칙

### 3.0 기능 변경 및 신규 기능 구현 규칙 (절대 위반 금지)

#### 3.0.1 기존 기능 보존 원칙
- ❌ **절대 금지**: 사용자 요청 전까지 기존에 구현된 기능을 삭제하거나 제거하는 행위
- ✅ **필수 준수**: 신규 기능 추가 시 기존 기능은 그대로 유지되어야 함
- ✅ **예외**: 사용자가 명시적으로 삭제를 요청한 경우에만 제거 가능

#### 3.0.2 신규 기능 구현 시 필수 절차
신규 기능을 구현할 때는 반드시 다음 절차를 따라야 합니다:

1. **사이드 이펙트 분석**
   - 신규 기능이 기존 기능에 미치는 영향 분석
   - 기존 테스트 케이스 영향도 확인
   - 다른 Phase나 플랫폼에 미치는 영향 파악

2. **내부 테스트 필수 실행**
   - 신규 기능 구현 후 반드시 내부 테스트 실행
   - 관련된 모든 테스트 케이스 통과 확인
   - 회귀 테스트 수행 (기존 기능 동작 보장)
   - 성능 테스트 (필요 시)

3. **테스트 통과 후 반영**
   - 모든 테스트가 통과한 경우에만 코드 반영
   - 테스트 실패 시 수정 후 재테스트 필수
   - 테스트 결과 문서화

4. **실제 동작 확인**
   - 코드 수정 전 기존 주요 로직 영향 여부 확인
   - 테스트 데이터와 수정 코드로 정상 동작 확인
   - 리얼 브라우저에서 실제 동작 확인

5. **예외 상황**
   - 긴급 수정이 필요한 경우에도 최소한의 회귀 테스트는 필수
   - 테스트 불가능한 경우 문서화 및 사후 검증 계획 수립

**위 절차를 위반한 코드 변경은 절대 금지됩니다.**

### 3.1 Normalizer 공통 규칙
모든 입력은 아래 구조의 Node 배열로 변환한다:
```
UUMNode {
  uid: string,
  platform: "SPEC"|"FIGMA"|"WEB"|"ANDROID"|"IOS",
  role?: string,
  name?: string,
  text?: string,
  selector?: string,
  visible?: boolean,
  bounds?: { x: number, y: number, w: number, h: number },
  meta?: Record<string, any>,
  path?: string
}
```
Normalizer는 반드시 `UUMDocument { platform, nodes[], capturedAt, source }` 형태로 반환한다.

### 3.2 Diff Engine 규칙
1) 매칭 우선순위  
- selector > role/path > text 유사도 > keywords  

2) 비교 규칙  
- TEXT_MISMATCH  
- MISSING_ELEMENT  
- VISIBILITY  
- POLICY  
- STRUCTURE  

3) LLM 사용 기준  
- LLM은 후처리 단계에서만 사용  
- 기능: 의미 동치 판단, Finding 요약/병합  
- Core diff는 반드시 Rule 기반 유지

### 3.3 Reporter 규칙
- Output: `findings[] + summary`  
- 기본: Markdown / JSON / HTML  
- 확장: Slack / PDF / CSV

---

## 4. 프론트엔드(UI) 지침
- Notion-style 입력 UI  
- GitHub PR-style 결과 Diff 테이블  
- 입력 필드는 항상 다음 순서:
  1) Spec  
  2) Figma  
  3) Web  
  4) Android  
  5) iOS  
  6) Phase 선택  
  7) Run Diff  
- Summary는 결과 최상단  
- Findings는 Severity 순 정렬

---

## 5. Phase별 정의

### Phase 1 (Spec ↔ Figma)
- Spec markdown/YAML ingest  
- Figma JSON ingest  
- selector 개념 도입  

### Phase 2 (Spec ↔ Figma ↔ Web)
- Playwright DOM Snapshot(JSON) 입력  

### Phase 3 (Spec ↔ Figma ↔ Web ↔ Android)
- adb uiautomator dump → XML → JSON Normalizer  

### Phase 4 (Spec ↔ Figma ↔ Web ↔ Android ↔ iOS)
- WDA/XCUITest accessibility dump Normalizer  

---

## 6. Collector 설계 기준
- Collector는 API와 분리된 Worker 구조  
- Web: Playwright snapshot.json (기본 headful, UI 표시)  
- Android: adb dump.xml → json  
- iOS: WDA accessibility dump  
- Collector 실패는 Diff Engine에 영향 주지 않는다

---

## 7. 코드 구조 표준
```
packages/core-engine/       # types, diff-engine, rules
packages/normalizers/*      # 플랫폼별 Normalizer
packages/collectors/*       # 수집기(Worker)
packages/reporters/*        # Reporter (markdown 등)
apps/diff-checker/          # Next.js App (UI + API)
apps/cli/                   # CLI 실행기
resources/samples/*         # 샘플 입력 데이터
```
함수명 규칙:
- normalizeSpec(), normalizeFigma(), normalizeWeb(), normalizeAndroid(), normalizeIOS()  
- runDiff() (앱 데모용) / DiffEngine.runPhase() (코어)  

---

## 8. 품질 기준
- 1회 Diff 실행 ≤ 3초  
- Normalizer 실패 시 graceful fallback  
- UUM 구조 변경 시 모든 Normalizer 영향 분석  
- Diff Engine 변경 시 Regression Diff 필수  

---

## 9. 협업 규칙
- selector 추가 요청은 기획팀 협의  
- 디자인에도 동일 selector 주입 권장  
- Web/App path/role/label 정비 요청 가능  
- Findings는 원본 그대로 전달하여 판단은 각 팀이 수행  

---

## 10. 문서화 규칙
- 구조 변경 시 즉시 본 지침서 업데이트  
- Phase 추가 시 버전 관리  
- 최신 아키텍처 다이어그램(SVG) 저장 및 공유  
- Confluence / Notion 동시 업데이트  

---

## 11. 테스트/회귀 기준
- 테스트 실행은 Playwright UI(headed) 노출 상태로 수행  
- 테스트: `docs/TESTING.md` 절차 참조  
- 회귀/성능: `docs/REGRESSION.md` 기준(≤3초) 및 측정 절차 준수

---

## 12. 문제 해결 프로세스

### 12.1 문제 발생 시 필수 절차

**문제 상황을 공유받았을 때, 코드 수정 전에 반드시 다음 단계를 거쳐야 합니다:**

#### Step 1: 문제 원인 파악
1. **현상 확인**
   - 문제가 발생한 구체적인 상황 파악
   - 에러 메시지, 로그, 결과 데이터 확인
   - 재현 가능한 최소 예시 수집

2. **근본 원인 분석**
   - 왜 이런 문제가 발생했는지 분석
   - 관련 코드, 데이터 흐름, 의존성 확인
   - 기존 설계 의도와의 차이점 파악

3. **영향 범위 파악**
   - 문제가 영향을 미치는 범위 확인
   - 다른 기능에 미치는 영향 분석
   - 기존 동작과의 차이점 확인

#### Step 2: 수정 방안 정리
1. **해결 방안 도출**
   - 가능한 해결 방안 여러 개 검토
   - 각 방안의 장단점 분석
   - 최적의 방안 선택

2. **수정 계획 수립**
   - 수정할 파일 및 함수 명시
   - 수정 내용 상세 설명
   - 예상 결과 및 검증 방법

#### Step 3: 사이드 이펙트 확인
1. **영향받는 기능 확인**
   - 수정으로 인해 영향받을 수 있는 기능 목록
   - 기존 테스트 케이스 영향도 분석
   - 다른 Phase나 플랫폼에 미치는 영향

2. **회귀 테스트 계획**
   - 수정 후 확인해야 할 테스트 케이스
   - 성능 영향도 확인 필요 여부
   - 기존 동작 보장 여부

3. **롤백 계획**
   - 문제 발생 시 롤백 방법
   - 대안 방안 준비

#### Step 4: 문서화 및 승인
1. **수정 계획 문서화**
   - 문제 원인, 해결 방안, 사이드 이펙트를 문서로 정리
   - 코드 수정 전에 공유 및 검토

2. **승인 후 수정**
   - 검토 완료 후 코드 수정 진행
   - 수정 후 검증 및 테스트

### 12.2 문제 해결 문서 템플릿

```markdown
## 문제 상황
- **발생 시점**: YYYY-MM-DD
- **재현 방법**: 
- **현상**: 
- **에러 메시지/결과**: 

## 원인 분석
- **근본 원인**: 
- **영향 범위**: 
- **관련 코드**: 

## 해결 방안
- **선택한 방안**: 
- **수정 내용**: 
- **수정 파일**: 
- **예상 결과**: 

## 사이드 이펙트 분석
- **영향받는 기능**: 
- **회귀 테스트 필요 항목**: 
- **성능 영향**: 
- **롤백 계획**: 

## 검증 방법
- **테스트 케이스**: 
- **확인 사항**: 
```

### 12.3 금지 사항

**다음과 같은 행동은 절대 금지됩니다:**

1. ❌ 문제 상황만 보고 바로 코드 수정
2. ❌ 원인 파악 없이 임시 방편 적용
3. ❌ 사이드 이펙트 확인 없이 수정
4. ❌ 기존 동작 보장 없이 변경
5. ❌ 문서화 없이 수정
6. ❌ **사용자 요청 전까지 기존 기능 삭제**
7. ❌ **신규 기능 구현 시 내부 테스트 없이 반영**
8. ❌ **테스트 실패 시에도 코드 반영**

### 12.4 예외 상황

**다음과 같은 긴급 상황에서는 프로세스를 간소화할 수 있습니다:**

- 프로덕션 서비스 중단
- 데이터 손실 위험
- 보안 취약점

**단, 긴급 수정 후에는 반드시:**
1. 사후 분석 문서 작성
2. 근본 원인 분석 및 재발 방지 대책 수립
3. 정식 수정 계획 수립

---

## 13. 코드 리뷰 기준
- (추가 예정)

---

## 14. 요구사항 문서 ↔ Figma 디자인 비교 보강 지침

본 섹션은 요구사항 문서 ↔ Figma 디자인 비교에서 반복적으로 발생하는 혼선을 방지하고, Diff Checker 구현 및 확장 시 **일관된 판단 기준**을 유지하기 위한 지침을 정의한다.

### 14.0 핵심 원칙 (QA 기준)

**이 프로젝트의 목적**:
- ❌ 문서 간 텍스트 차이를 많이 찾는 것이 아님
- ✅ **QA가 실제로 판단 가능한 "요구사항 불일치 가능성"만을 식별**

**이 도구는 결함 판정기가 아니다**:
- 버그 확정 ❌
- 기획 오류 확정 ❌
- 수정 필요 여부 단정 ❌

**이 도구가 수행하는 것**:
- 확인 필요 영역 식별 ✅
- QA 리스크 포인트 탐지 ✅
- Pre-QA 범위 축소 ✅

**Diff 결과는 "QA 판단 단위"여야 한다**:
- REQUIREMENT (요구사항) 단위로 비교
- "이 요구가 지켜졌는가?" 관점
- "사람이 추가 확인해야 하는가?" 관점

### 14.1 비교 대상에 대한 명확한 기준 정의

#### 14.1.1 비교 대상이 되는 Spec 텍스트

다음 항목만을 **UI 비교 대상**으로 간주한다.

- 실제 화면에 표시되는 텍스트
  - 버튼명, 라벨, 옵션명, 탭명
  - 툴팁, 경고 문구, 안내 문구
- 따옴표로 명시된 UI 텍스트
  - 예: `"필터" 버튼을 누르면`
- UI 키워드와 함께 언급된 짧은 문구
  - 예: `필터 버튼`, `정렬 옵션`, `확인 팝업`

이 외의 텍스트는 기본적으로 **비교 대상이 아니다.**

#### 14.1.2 비교 대상이 아닌 Spec 텍스트 (중요)

다음 항목은 **비교 대상에서 명시적으로 제외**한다.

- 배경 설명, 정책 설명, 목적 설명
- 일정, 우선순위, 히스토리
- 메타데이터
  - 티켓 번호, UUID, 색상 코드, Boolean 값
- 구현 의도 또는 기술적 설명
- "~을 기반으로", "~을 위해", "~하도록 한다" 등의 설명 문장

> ⚠️ 위 항목은 Figma에 존재하지 않는 것이 정상이며,  
> Diff 결과에 포함될 경우 **False Positive로 간주한다.**

#### 14.1.3 비교 대상이 아닌 Figma 텍스트 (중요 - QA 기준)

다음 항목은 **요구사항이 아니며, Diff 대상에서 반드시 제외**한다.

- 해상도/사이즈 설명
  - 예: `583 * 300`, `321-579`
- 폰트/디자인 가이드
  - 예: `텍스트 크기 30/36`
- 디자이너 작업 가이드
  - `Copy 가능`, `Text`, `Text + Image`
- 샘플/더미 텍스트
  - `일이삼사오육칠팔구십`, `Lorem ipsum`
- 날짜/버전 메모
  - `26.01.05 update`
- 구조/레이어 명칭
  - `Frame`, `Component`, `Group`, `Document`

> ⚠️ 위 텍스트가 Diff 결과에 포함되면 **오탐(False Positive)** 으로 간주한다.  
> `FigmaNormalizer`에서 `isDesignerGuideText()` 함수로 필터링해야 한다.

### 14.2 Spec ↔ Figma 비교의 기본 철학

#### 14.2.1 비교는 1:1 문자열 일치가 목적이 아니다

본 Diff Checker의 목적은 다음을 확인하는 데 있다.

- 실제 화면(UI)에 존재하는 요소가 Spec에 **전혀 언급되지 않았는가**
- Spec에 명시된 UI 텍스트가 **화면에서 누락되었는가**
- 명백한 텍스트 불일치가 존재하는가

즉,
> "Spec 문서 전체가 Figma와 동일해야 한다"가 아니라  
> **"UI로 약속된 부분이 지켜졌는가"**를 검증한다.

#### 14.2.2 역방향 비교(Figma → Spec)를 1차 기준으로 사용한다

비교 순서는 다음을 원칙으로 한다.

1. **역방향 비교 (Figma → Spec)**
   - 실제 화면에 존재하는 UI 텍스트가
   - Spec 문서에 전혀 언급되지 않았는지 확인
   - 누락된 경우 → 높은 신뢰도의 결함

2. **정방향 비교 (Spec → Figma)**
   - Spec에서 "UI로 명시된 항목"만 비교
   - 구조화된 Spec 또는 명확한 패턴만 대상

이 순서를 통해,
- 자연어 중심 Spec의 한계를 보완하고
- 불필요한 False Positive를 최소화한다.

### 14.3 LLM 활용에 대한 지침 (중요)

#### 14.3.1 LLM은 보조 수단이지 기준이 아니다

LLM은 다음 용도로만 제한적으로 사용한다.

- Spec 문서에서 UI 텍스트 후보 추출
- 의미적으로 유사한 표현 병합
- Diff 결과 요약 및 설명 개선

LLM 결과는 항상 다음 속성을 가져야 한다.

- confidence score
- rule 기반 결과와 분리된 출력

> ⚠️ LLM 결과만으로 MAJOR 결함을 생성하지 않는다.

#### 14.3.2 권장 적용 방식

```typescript
deriveSpecItemsFromMarkdown({
  mode: 'rule-only' | 'llm-assisted',
  confidenceThreshold: 0.8
})
```

**mode 옵션**:
- `rule-only`: 규칙 기반 필터링만 사용 (기본값)
- `llm-assisted`: LLM을 활용한 UI 텍스트 추출 (선택사항)

**confidenceThreshold**:
- LLM 추출 결과의 신뢰도 임계값
- 기본값: 0.8 (80% 이상 신뢰도만 사용)

**구현 원칙**:
- LLM 결과는 항상 rule 기반 결과와 병합
- LLM 결과만으로 독립적인 finding 생성 금지
- LLM 실패 시 rule 기반 결과만 사용 (graceful fallback)

---

## 15. 코드 리뷰 기준




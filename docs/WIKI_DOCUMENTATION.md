# 멀티 플랫폼 Spec Diff Checker 구축

AI를 활용한 vibe 코딩 방식으로 기획서(Spec), Figma 디자인, Web/앱 구현물 간의 불일치를 자동으로 탐지하는 프로그램이다.

---

## Update History

| 일시 | 내용 | 작성자 |
| --- | --- | --- |
| 25.11.16 | 초안 작성 | Elon |
| 25.01.19 | Phase 2 구현 완료 및 3-Agent 아키텍처 추가 | Elon |
| 25.01.19 | 노이즈 필터링 강화 및 문서화 완료 | Elon |

---

## 1. 목적 및 기대효과

### 목적
- 기획서(Spec), Figma 디자인, Web/앱 구현물 간의 불일치를 자동으로 탐지하여 QA 사전 검증 (Pre-QA) 및 스프린트 품질 게이트로 활용하는 내부 도구를 구축한다.
- **핵심 목적**: QA가 '추가 확인이 필요한 요구사항'을 빠르게 식별하도록 돕는 것

### 핵심 효과
- **기획 ↔ 디자인 ↔ 개발 불일치로 인한 불필요한 커뮤니케이션 비용 감소**
  - Spec-Figma-Web 간 텍스트/정책 불일치 자동 탐지
  - 변경된 기획이 디자인/구현에 제때 반영되지 않는 문제 조기 발견
  
- **Web/Android/iOS 간 정책/문구/노출 정책 불일치 조기 발견**
  - Phase 2: Web 플랫폼 비교 지원
  - 향후 Phase 3, 4에서 Android/iOS 비교 지원 예정

- **QA가 사전 품질 게이트(Build Acceptance Test 역할)를 자동화하여 타팀과의 갈등 없이 품질 지표를 개선할 수 있는 기반 마련**
  - Diff 결과를 통한 객관적 품질 지표 제공
  - False Positive 최소화로 실용적인 결과 제공

---

## 2. 배경 및 문제 정의

### 현재 스프린트 품질 지표
- 유효 결함 수가 많음
- 리오픈 비율이 높음
- 1차 패스 비율이 낮은 편 (평균 ~67%)

### 주요 원인
1. **기획 문서, 디자인(Figma), 실제 구현(Web/앱)의 불일치**
   - 변경된 기획이 Figma/구현에 제때 반영되지 않음
   - 플랫폼별(Web/Android/iOS) 정책/문구가 제각각 적용되는 구조

2. **QA는 이를 사후 테스트에서 발견**
   - 발견 시점이 늦어 스프린트 일정 및 팀 간 협업에 부담이 커짐
   - 사전 검증 도구 부재

### 해결 방안
- 개발물이 나오기 전/직후에 Spec-Design-Implementation 간의 diff를 자동으로 검출하는 도구 필요
- AI를 활용한 자동화로 QA 업무 효율성 향상

---

## 3. 구축 범위

### Phase별 구현 현황

#### ✅ Phase 1: Spec ↔ Figma Diff Checker (구현 완료)
- **기능**: 기획서와 Figma 디자인 간 불일치 탐지
- **입력**: Spec 문서 (위키/PDF/텍스트), Figma JSON
- **비교 규칙**:
  - 정방향 비교 (Spec → Figma)
  - 역방향 비교 (Figma → Spec)
  - 텍스트 매칭, 유사도 기반 매칭
  - 메타데이터 자동 필터링

#### ✅ Phase 2: Spec ↔ Figma ↔ Web Diff Checker (구현 완료)
- **기능**: Web 구현물까지 비교 범위 확장
- **입력**: Spec 문서, Figma JSON, Web DOM JSON
- **비교 규칙**:
  - selectorKey 기반 1:1 매핑 비교
  - 텍스트 기반 매칭 (fallback)
  - 역방향 비교 (Figma → Spec)
  - 노이즈 필터링 강화 (특수 문자, 메타데이터, 상태 라벨 제외)

#### 🔄 Phase 3: Spec ↔ Figma ↔ Web ↔ Android Diff Checker (구현 예정)
- **기능**: Android 구현물 비교 추가
- **입력**: Android UI Dump (adb uiautomator dump)
- **예상 구현**: Android Normalizer를 통한 UUM 변환

#### 🔄 Phase 4: Spec ↔ Figma ↔ Web ↔ Android ↔ iOS Diff Checker (구현 예정)
- **기능**: iOS 구현물 비교 추가
- **입력**: iOS UI Dump (WDA/XCUITest accessibility dump)
- **예상 구현**: iOS Normalizer를 통한 UUM 변환

### 각 Phase별 공통 처리 과정
1. **입력 파일/데이터 수집**
   - Spec: 위키 HTML, PDF 텍스트, 마크다운
   - Figma: API JSON 또는 Plugin JSON
   - Web: Playwright를 통한 DOM 추출
   - Android/iOS: UI Dump JSON

2. **Normalizer/Parser를 통한 공통 모델 변환**
   - 각 플랫폼별 Normalizer가 UUM(Unified UI Model)로 변환
   - UUM 구조: `{ platform, nodes: [{ text, role, selector, selectorKey, ... }] }`

3. **Diff Engine에서 비교 규칙 + LLM 활용**
   - 규칙 기반 비교 (keyed.diff, text.strict, reverse.comparison 등)
   - LLM 보조 검증 (선택사항)
   - 노이즈 필터링

4. **Reporter를 통한 결과 제공**
   - Markdown 리포트 (기본)
   - HTML 리포트 (선택)
   - JSON 리포트 (API용)

---

## 4. 아키텍처 개요

### 전체 흐름
```
프런트(Next.js) 
  → /api/diff 호출 
  → Normalizer(Spec/Figma/Web/Android/iOS) 
  → UUM(Unified UI Model) 
  → Diff Engine(Rules + LLM 보조) 
  → Reporter(MD/HTML/JSON)
```

### 핵심 컴포넌트

#### 1. Normalizer 계층
- **SpecNormalizer**: 위키 HTML/PDF 텍스트 → UUM
- **FigmaNormalizer**: Figma JSON → UUM
- **WebNormalizer**: Web DOM JSON → UUM
- **AndroidNormalizer**: Android UI Dump → UUM (예정)
- **IOSNormalizer**: iOS UI Dump → UUM (예정)

#### 2. Diff Engine
- **규칙 기반 비교**: DiffRule 인터페이스 기반
  - `keyed.diff`: selectorKey 기반 1:1 매핑
  - `text.strict`: 텍스트 기반 매칭 (fallback)
  - `reverse.comparison`: 역방향 비교 (Figma → Spec)
- **LLM 보조**: 선택적 검증 및 정제

#### 3. Reporter 계층
- **MarkdownReporter**: 마크다운 형식 리포트
- **HTMLReporter**: HTML 형식 리포트
- **JSONReporter**: JSON 형식 리포트 (API용)

---

## 5. 프로젝트 구조

```
DiffChecker/
├── apps/
│   ├── cli/                    # CLI 실행기
│   ├── diff-checker/           # Next.js App (UI + API)
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   └── diff/      # /api/diff 엔드포인트
│   │   │   └── page.tsx        # 메인 UI
│   │   └── lib/
│   │       ├── table-parser.ts # 위키 HTML 표 파싱
│   │       └── diff.ts
│   └── web/                    # 데모 웹 앱
│
├── packages/
│   ├── core-engine/            # Diff Engine 핵심
│   │   └── src/
│   │       ├── diff-engine.ts   # DiffEngine 클래스
│   │       ├── rules.ts        # 비교 규칙들
│   │       └── types.ts        # UUM 타입 정의
│   │
│   ├── normalizers/             # 플랫폼별 Normalizer
│   │   ├── spec-normalizer/    # Spec → UUM
│   │   ├── figma-normalizer/   # Figma → UUM
│   │   ├── web-normalizer/     # Web → UUM
│   │   ├── android-normalizer/ # Android → UUM (예정)
│   │   └── ios-normalizer/     # iOS → UUM (예정)
│   │
│   ├── collectors/              # 데이터 수집기
│   │   ├── web-collector/      # Playwright 기반 Web DOM 추출
│   │   ├── android-collector/  # adb 기반 Android UI 추출 (예정)
│   │   └── ios-collector/      # WDA 기반 iOS UI 추출 (예정)
│   │
│   ├── reporters/               # 리포트 생성기
│   │   ├── markdown-reporter/  # Markdown 리포트
│   │   ├── html-reporter/      # HTML 리포트
│   │   └── json-reporter/      # JSON 리포트
│   │
│   └── adapters/                # 외부 서비스 어댑터
│       ├── llm-adapter/        # LLM 통합 (선택사항)
│       └── storage-adapter/    # 스토리지 통합
│
├── configs/                     # 설정 파일
│   ├── project.config.yaml     # 프로젝트 설정
│   ├── rules.config.yaml       # 규칙 설정
│   └── table-parser.config.yaml # 표 파서 설정
│
├── docs/                        # 문서
│   ├── agents/                  # 3-Agent 아키텍처 문서
│   ├── HOW_IT_WORKS.md         # 작동 원리
│   └── ...
│
└── tests/                       # 테스트
    └── ui-snapshots/            # UI 스냅샷 테스트
```

### 모노레포 구조
- **패키지 관리**: pnpm workspace
- **빌드**: TypeScript
- **테스트**: Vitest (단위), Playwright (E2E)

---

## 6. 전체 처리 플로우 (Sequence Diagram)

### Phase 2 처리 흐름

```
[사용자]
    ↓
[Next.js UI]
    ↓ (POST /api/diff)
[API Route (/api/diff)]
    ↓
[입력 데이터 수집]
    ├── Spec: 위키 HTML / PDF 텍스트
    ├── Figma: JSON
    └── Web: JSON (또는 URL)
    ↓
[병렬 Normalizer 실행]
    ├── SpecNormalizer.normalize(specHtml)
    ├── FigmaNormalizer.normalize(figmaJson)
    └── WebNormalizer.normalize(webJson)
    ↓
[UUM 변환 완료]
    ├── specDoc: UUMDocument
    ├── figmaDoc: UUMDocument
    └── webDoc: UUMDocument
    ↓
[Spec 파싱]
    └── extractSpecItemsFromTables(specHtml)
        → SpecItem[] 추출
    ↓
[Diff Engine 실행]
    └── DiffEngine.runPhase(phase, { spec, figma, web }, specItems)
        ├── keyed.diff 규칙 적용
        ├── text.strict 규칙 적용
        └── reverse.comparison 규칙 적용
    ↓
[Findings 생성]
    └── DiffFinding[] 생성
    ↓
[노이즈 필터링]
    └── 필터링된 Findings
    ↓
[Reporter 생성]
    └── Markdown/HTML/JSON 리포트
    ↓
[사용자에게 결과 반환]
```

### 주요 처리 단계 상세

#### 1. 입력 수집 단계
- **Spec**: 위키 HTML 파싱 또는 PDF 텍스트 추출
- **Figma**: API 또는 Plugin을 통한 JSON 추출
- **Web**: Playwright를 통한 DOM 추출 또는 직접 JSON 입력

#### 2. Normalizer 단계
- 각 플랫폼별 데이터를 UUM(Unified UI Model)로 변환
- UUM 구조: `{ platform, nodes: [{ text, role, selector, selectorKey, ... }] }`
- selectorKey 추출: data-qa, data-testid 등

#### 3. Spec 파싱 단계
- 위키 HTML 표에서 SpecItem 추출
- 텍스트에서 UI 텍스트 추출
- selectorKey 매핑 정보 추출

#### 4. Diff Engine 단계
- **keyed.diff**: selectorKey 기반 1:1 매핑 비교
- **text.strict**: 텍스트 기반 매칭 (fallback)
- **reverse.comparison**: 역방향 비교 (Figma → Spec)

#### 5. 필터링 단계
- 노이즈 텍스트 제거 (특수 문자, 메타데이터, 상태 라벨 등)
- False Positive 최소화

#### 6. 리포트 생성 단계
- Findings를 Markdown/HTML/JSON 형식으로 변환
- 사용자에게 결과 제공

---

## 7. 실행 결과

### Phase 2 실행 예시

#### 입력 데이터
- **Spec**: 위키 HTML (서비스 탈퇴 화면 기획서)
- **Figma**: JSON (29개 텍스트 노드)
- **Web**: JSON (2개 노드: label, button)

#### 처리 결과
- **SpecItems 추출**: 3개 (표에서 추출)
  - "유료 캐시 및 이용권 보유 중"
  - "탈퇴 시 보유한 이용권과 잔여 캐시는 모두 소멸되고, 복원 및 환불 불가한 것을 확인했습니다."
  - "탈퇴"

- **Findings 생성**: 5개
  - MAJOR: 1개 (스펙 텍스트가 WEB/FIGMA에 미존재)
  - MINOR: 3개 (Figma에 있지만 Spec에 언급되지 않음)
  - INFO: 1개 (확인 필요 항목)

#### 노이즈 필터링 결과
- **필터링 전**: 8개 findings
- **필터링 후**: 5개 findings
- **제거된 노이즈**: 
  - "·" (특수 문자)
  - "320 해상도" (해상도 라벨)
  - "Last Update / 2025.11.06" (메타데이터)
  - "보유 유료 이용권 및 유료 캐시 미노출" (상태 라벨)
  - "탈퇴 버튼 - 비활성화" (상태 라벨)

### 실제 사용 시나리오

#### 시나리오 1: 구조화된 위키 문서
- **입력**: 위키 표 형식의 기획서
- **결과**: 정확한 텍스트 매칭, selectorKey 기반 비교

#### 시나리오 2: 자연어 위키 문서
- **입력**: 자연어로 작성된 기획서
- **결과**: 역방향 비교로 키워드 매칭, 유사도 기반 비교

#### 시나리오 3: 하이브리드 문서
- **입력**: 구조화된 항목 + 자연어 설명
- **결과**: 최고의 정확도 (정방향 + 역방향 비교)

### 성능 지표
- **Diff 실행 시간**: ≤ 3초 (목표)
- **정확도**: False Positive 최소화 (노이즈 필터링 강화)
- **확장성**: Phase별 점진적 확장 가능

---

## 8. 향후 계획

### Phase 3 구현 예정
- Android UI Dump 수집 및 Normalizer 구현
- Android 플랫폼 비교 규칙 추가

### Phase 4 구현 예정
- iOS UI Dump 수집 및 Normalizer 구현
- iOS 플랫폼 비교 규칙 추가

### 개선 사항
- LLM 기반 SpecItem 검증 강화
- 성능 최적화
- 리포트 형식 다양화

---

## 9. 참고 문서

- `docs/HOW_IT_WORKS.md`: 작동 원리 상세 설명
- `docs/PROJECT_CONSTITUTION.md`: 프로젝트 헌장 및 원칙
- `docs/agents/`: 3-Agent 아키텍처 문서
- `docs/PHASE1_USAGE.md`: Phase 1 사용 가이드

---

## 10. 기술 스택

- **프레임워크**: Next.js 14
- **언어**: TypeScript
- **패키지 관리**: pnpm workspace (모노레포)
- **테스트**: Vitest (단위), Playwright (E2E)
- **AI 통합**: Cursor AI (vibe 코딩), LLM Adapter (선택사항)

---

## 11. 팀 내 공유 사항

### 사용 방법
1. Next.js 앱 실행: `pnpm dev:next`
2. 브라우저에서 `http://localhost:3000` 접속
3. Spec, Figma, Web 데이터 입력
4. Diff 실행 및 결과 확인

### 주의사항
- Spec 문서는 위키 HTML 또는 PDF 형식 지원
- Figma 데이터는 API 또는 Plugin을 통해 추출
- Web 데이터는 Playwright를 통한 자동 수집 또는 직접 JSON 입력 가능

### 문의
- 프로젝트 관련 문의: [담당자 정보]
- 기술 문의: [기술 담당자 정보]

# Phase 1 사용 가이드: Spec ↔ Figma 비교

## 개요

Phase 1은 스펙 문서와 Figma 디자인 파일을 비교하여 일관성을 검증합니다.

## 비교 방법

### 방법 1: 웹 UI 사용 (권장)

#### 1단계: 개발 서버 실행
```bash
cd /Users/kakaoent/spec-diff-checker/DiffChecker
pnpm dev:next
```

브라우저에서 `http://localhost:3000` 접속

#### 2단계: Phase 선택
- 상단 헤더에서 "Phase" 드롭다운 선택
- **"1: Spec ↔ Figma"** 선택

#### 3단계: Spec 입력
- "Spec (Markdown/Text)" 필드에 스펙 내용 입력

**입력 예시:**
```
로그인 버튼의 텍스트는 "로그인" 이다.
아이디 입력창이 노출되어야 한다.
비밀번호 입력창이 노출되어야 한다.
```

**스펙 작성 규칙:**
- 한 줄에 하나의 요구사항
- 텍스트는 따옴표로 감싸기: `"로그인"`
- 노출 요구사항은 "노출되어야 한다" 문구 포함
- 빈 줄은 자동으로 무시됨

#### 4단계: Figma JSON 입력
- "Figma JSON (Paste)" 필드에 Figma JSON 붙여넣기

**Figma JSON 형식:**
```json
{
  "document": {
    "id": "0:0",
    "name": "Login Screen",
    "type": "FRAME",
    "visible": true,
    "children": [
      {
        "id": "1:1",
        "type": "TEXT",
        "name": "Title",
        "characters": "로그인",
        "visible": true
      },
      {
        "id": "1:2",
        "type": "TEXT",
        "name": "Login Button",
        "characters": "로그인",
        "visible": true
      }
    ]
  }
}
```

**Figma JSON 얻는 방법:**
- Figma API를 통해 가져오기
- Figma 플러그인으로 export
- 수동으로 JSON 구조 작성

#### 5단계: 비교 실행
- "Run Diff" 버튼 클릭
- 결과가 오른쪽 패널에 표시됨

#### 6단계: 결과 확인
- **Summary**: CRITICAL/MAJOR/MINOR/INFO 개수
- **Findings**: Severity 순으로 정렬된 차이점 목록
- **Export**: Markdown/JSON/HTML로 결과 저장 가능

---

### 방법 2: CLI 사용

#### 1단계: 설정 파일 준비
`configs/project.config.yaml` 파일 수정:

```yaml
phase: 1
spec: resources/samples/spec.md
figma: resources/samples/figma.json
rules:
  include:
    - text.strict
    - missing.element
    - visibility.requirement
    - policy.basic
    - structure.basic
```

#### 2단계: Spec 파일 준비
`resources/samples/spec.md` 파일에 스펙 작성:

```markdown
로그인 버튼의 텍스트는 "로그인" 이다.
아이디 입력창이 노출되어야 한다.
비밀번호 입력창이 노출되어야 한다.
```

#### 3단계: Figma JSON 파일 준비
`resources/samples/figma.json` 파일에 Figma JSON 저장

#### 4단계: 실행
```bash
cd /Users/kakaoent/spec-diff-checker/DiffChecker
pnpm start:cli
```

#### 5단계: 결과 확인
- 콘솔에 결과 요약 출력
- `reports/phase-1.md` 파일에 상세 리포트 생성

---

## 비교 로직 설명

### 매칭 우선순위 (가이드라인 준수)

1. **selector 우선 매칭**
   - Spec에 selector가 있으면 Figma의 selector와 정확히 일치하는지 확인

2. **role/path 기반 매칭**
   - selector가 없으면 role이나 path로 매칭 시도

3. **text 유사도 매칭**
   - 텍스트 내용의 유사도를 계산하여 매칭
   - 유사도 90% 이상이면 일치로 판단
   - 50~90% 사이면 TEXT_MISMATCH로 보고

4. **keywords 매칭**
   - 위 방법으로 매칭되지 않으면 키워드 포함 여부로 확인

### 비교 규칙

#### 1. TEXT_MISMATCH
- **설명**: Spec에 정의된 텍스트가 Figma에 없거나 다름
- **Severity**: MAJOR (유사도 < 50%) 또는 MINOR (유사도 50~90%)
- **예시**: 
  - Spec: "로그인"
  - Figma: "Login" → 유사도 낮음으로 보고

#### 2. MISSING_ELEMENT
- **설명**: Spec에서 요구한 요소가 Figma에 없음
- **Severity**: CRITICAL
- **예시**:
  - Spec: "아이디 입력창이 노출되어야 한다"
  - Figma: 해당 요소 없음 → MISSING_ELEMENT

#### 3. VISIBILITY
- **설명**: Spec의 show/hide 요구사항과 Figma의 visible 속성이 불일치
- **Severity**: MAJOR (show 요구인데 숨김) 또는 MINOR (hide 요구인데 노출)
- **예시**:
  - Spec: "확인 버튼이 노출되어야 한다"
  - Figma: visible: false → VISIBILITY 문제

#### 4. POLICY
- **설명**: 정책 관련 키워드(성인/로그인/제한/동의/확인) 존재 여부 확인
- **Severity**: MINOR
- **예시**:
  - Spec: "성인 등급은 이용이 제한됩니다"
  - Figma: 해당 문구 없음 → POLICY 문제

#### 5. STRUCTURE
- **설명**: 문서 구조가 비정상(빈 문서/루트 누락)
- **Severity**: INFO
- **예시**:
  - Figma JSON이 비어있음 → STRUCTURE 문제

---

## 실제 사용 예시

### 예시 1: 기본 비교

**Spec 입력:**
```
로그인 버튼의 텍스트는 "로그인" 이다.
```

**Figma JSON:**
```json
{
  "document": {
    "children": [
      {
        "type": "TEXT",
        "characters": "로그인"
      }
    ]
  }
}
```

**결과**: ✅ 차이 없음 (findings: 0건)

---

### 예시 2: 텍스트 불일치

**Spec 입력:**
```
로그인 버튼의 텍스트는 "로그인" 이다.
```

**Figma JSON:**
```json
{
  "document": {
    "children": [
      {
        "type": "TEXT",
        "characters": "Login"
      }
    ]
  }
}
```

**결과**: 
- Finding 1건: TEXT_MISMATCH
- "스펙 텍스트가 미존재: '로그인'" 또는 유사도 낮음

---

### 예시 3: 요소 누락

**Spec 입력:**
```
아이디 입력창이 노출되어야 한다.
비밀번호 입력창이 노출되어야 한다.
```

**Figma JSON:**
```json
{
  "document": {
    "children": [
      {
        "type": "TEXT",
        "name": "Title",
        "characters": "로그인"
      }
    ]
  }
}
```

**결과**:
- Finding 2건: MISSING_ELEMENT (CRITICAL)
- "스펙 요소가 대상 문서에 없음: '아이디 입력창이 노출되어야 한다'"
- "스펙 요소가 대상 문서에 없음: '비밀번호 입력창이 노출되어야 한다'"

---

## 결과 해석

### Summary 카드
- **CRITICAL**: 필수 요소 누락 (즉시 수정 필요)
- **MAJOR**: 중요한 차이점 (우선 수정 권장)
- **MINOR**: 작은 차이점 (검토 필요)
- **INFO**: 정보성 메시지 (참고용)

### Findings 테이블
- Severity 순으로 정렬 (CRITICAL → MAJOR → MINOR → INFO)
- 각 finding은 다음 정보 포함:
  - **Severity**: 심각도
  - **Category**: 문제 유형
  - **Description**: 문제 설명

### Export 기능
- **Markdown**: 문서화용
- **JSON**: API 연동/자동화용
- **HTML**: 웹에서 바로 확인용

---

## 주의사항

1. **Spec 작성 시**
   - 명확한 문구 사용
   - 따옴표로 텍스트 강조: `"로그인"`
   - "노출되어야 한다" 문구로 visibility 요구사항 명시

2. **Figma JSON 형식**
   - `document` 또는 최상위 객체에 구조 포함
   - `children` 배열로 중첩 구조 표현
   - `characters` 필드에 텍스트 내용
   - `visible` 필드로 가시성 표현

3. **비교 정확도**
   - selector가 있으면 더 정확한 매칭 가능
   - 텍스트 유사도는 대소문자 무시, 공백 정규화
   - 한글/영문 혼용 시 유사도가 낮을 수 있음

---

## 다음 단계

Phase 1이 완료되면:
- Phase 2: Web 추가 비교
- Phase 3: Android 추가 비교  
- Phase 4: iOS 추가 비교

각 Phase는 이전 Phase의 모든 비교를 포함합니다.



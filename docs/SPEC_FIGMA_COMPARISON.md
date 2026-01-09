# Spec ↔ Figma 비교 가이드

## 현재 비교 방식

### 1. 데이터 변환 과정

```
기획 요구사항 문서 (Spec)
  ↓ SpecNormalizer
UUMDocument (nodes: [{text, role, selector, ...}])
  ↓
Diff Engine
  ↓
Figma JSON
  ↓ FigmaNormalizer  
UUMDocument (nodes: [{text, name, role, bounds, ...}])
```

### 2. 비교 규칙

현재 시스템은 다음 규칙으로 비교합니다:

1. **TEXT_MISMATCH**: Spec의 텍스트와 Figma의 텍스트가 일치하지 않음
2. **MISSING_ELEMENT**: Spec에 명시된 요소가 Figma에서 찾을 수 없음
3. **VISIBILITY**: Spec에서 요구한 노출/비노출 상태가 다름
4. **POLICY**: 정책 관련 요구사항 불일치
5. **STRUCTURE**: 구조적 차이 발견

### 3. 매칭 우선순위

```
selector > role/path > text 유사도 > keywords
```

## 사용 방법

### 방법 1: 텍스트 입력

**Spec 입력 예시:**
```
성인 등급은 이용이 제한됩니다
확인 버튼 노출
"필터" 텍스트 노출되어야 함
```

**Figma JSON 입력:**
- Figma에서 디자인 파일을 열고
- Plugins → "Export JSON" 또는 API를 통해 JSON 추출
- JSON을 붙여넣기

### 방법 2: 위키 링크

1. 위키에 기획 요구사항 문서 작성
2. 위키 링크 입력
3. 자동으로 내용 추출

### 방법 3: PDF 업로드

1. 기획 요구사항 PDF 파일 업로드
2. 자동으로 텍스트 추출
3. Figma JSON과 비교

## Figma JSON 추출 방법

### 방법 1: Figma API 사용 (권장)

```bash
# Figma Personal Access Token 필요
curl -H "X-Figma-Token: YOUR_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY" > figma.json
```

### 방법 2: Figma Plugin 사용

1. Figma에서 Plugins → "Export to JSON" 검색
2. 플러그인 설치 후 실행
3. JSON 파일 다운로드

### 방법 3: 수동 추출

Figma Dev Mode에서:
1. Frame 선택
2. Inspect 패널에서 "Copy as JSON" 클릭
3. JSON 복사

## 비교 결과 해석

### CRITICAL
- 필수 텍스트가 누락됨
- 정책 위반 사항

### MAJOR  
- 중요한 텍스트 불일치
- 필수 요소 누락

### MINOR
- 텍스트 유사도가 낮지만 의미는 유사
- 선택적 요소 차이

### INFO
- 참고사항
- 구조적 차이

## 개선 방안

### 1. 구조화된 Spec 입력 지원

현재는 단순 텍스트만 지원하지만, 다음 형식도 지원하면 더 정확한 비교가 가능합니다:

```yaml
# spec.yaml 예시
elements:
  - id: "filter-button"
    text: "필터"
    role: "button"
    visible: true
    position: "bottom-sheet"
  - id: "sort-option-1"
    text: "원기소"
    role: "option"
    visible: true
```

### 2. Figma 컴포넌트 매핑

SpecItem에 `selector`를 명시하면 더 정확한 매칭이 가능합니다:

```
Spec: "필터" (selector: "filter-button")
  ↓
Figma: {name: "filter-button", characters: "필터"}
  ✅ 정확한 매칭
```

### 3. 시각적 비교 결과

현재는 텍스트 기반 결과만 제공하지만, Figma 노드의 `bounds` 정보를 활용하여:
- 시각적 하이라이트
- Before/After 비교 뷰
- 차이점 표시

## 실제 사용 예시

### 예시 1: 텍스트 비교

**Spec:**
```
"시간표 내 정렬 추가"
"필터" 버튼 노출
"정렬 선택" 섹션에 "원기소", "조회순" 옵션
"보기 선택" 섹션에 "2단", "3단" 옵션
```

**Figma JSON 구조:**
```json
{
  "type": "FRAME",
  "name": "FilterModal",
  "children": [
    {
      "type": "TEXT",
      "name": "Title",
      "characters": "필터"
    },
    {
      "type": "FRAME",
      "name": "SortOptions",
      "children": [
        {"type": "TEXT", "characters": "원기소"},
        {"type": "TEXT", "characters": "조회순"}
      ]
    }
  ]
}
```

**비교 결과:**
- ✅ "필터" 텍스트 매칭
- ✅ "원기소", "조회순" 옵션 매칭
- ⚠️ "시간표 내 정렬 추가" 텍스트가 Figma에 없음 → MISSING_ELEMENT

### 예시 2: 구조 비교

**Spec:**
```
정렬 선택: "원기소" (기본값), "조회순"
보기 선택: "2단" (기본값), "3단"
```

**Figma:**
- 정렬 선택: "원기소", "조회순" ✅
- 보기 선택: "2단", "3단" ✅
- 기본값 표시 방식 차이 → MINOR

## 팁

1. **Spec 작성 시**: 명확한 텍스트와 선택자(selector)를 함께 명시
2. **Figma 설계 시**: 컴포넌트 이름을 명확하게 지정 (예: "filter-button", "sort-option-1")
3. **비교 전**: Spec과 Figma의 용어 통일 확인
4. **결과 검토**: CRITICAL과 MAJOR부터 우선 처리



# Spec ↔ Figma 비교 가이드

## 문제 상황

위키 요구사항 문서와 Figma 디자인은 **본질적으로 다른 목적**을 가지고 있습니다:

### 위키 요구사항 문서
- ✅ 프로젝트 개요 및 전체 설명
- ✅ 메타데이터 (작성자, 날짜, 티켓 번호 등)
- ✅ 문서 구조 (목차, 섹션 헤더)
- ✅ 정책 설명 및 배경 설명
- ✅ 실제 UI 텍스트

### Figma 디자인 파일
- ✅ 실제 화면에 보이는 UI 요소만
- ✅ 버튼명, 라벨, 툴팁 등 사용자에게 보이는 텍스트
- ✅ 시각적 레이아웃 및 구조
- ❌ 메타데이터 없음
- ❌ 문서 구조 없음

## 현재 시스템의 문제점

현재 `deriveSpecItemsFromMarkdown` 함수는 **위키 문서의 모든 텍스트**를 UI 텍스트로 취급합니다:

```typescript
// 현재 구현
function deriveSpecItemsFromMarkdown(specText: string): SpecItem[] {
  const lines = specText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: SpecItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 모든 줄을 SpecItem으로 변환
    items.push({ id: `spec-text-${i}`, kind: 'TEXT', text: line });
  }
  return items;
}
```

**결과**: 601건의 차이 중 대부분이 메타데이터/문서 구조 관련 항목입니다.

## 해결 방안

### 방안 1: 구조화된 Spec 입력 (권장)

위키 문서에서 **실제 UI 관련 텍스트만** 추출하여 입력:

#### 방법 A: 따옴표로 UI 텍스트 표시

```
"필터" 버튼 노출
"정렬 선택" 섹션에 "원기소", "조회순" 옵션
"보기 선택" 섹션에 "2단", "3단" 옵션
```

현재 시스템은 따옴표로 감싼 텍스트만 추출합니다.

#### 방법 B: YAML 형식으로 구조화

```yaml
ui_elements:
  - selector: "filter-button"
    text: "필터"
    role: "button"
    visible: true
  
  - selector: "sort-option-1"
    text: "원기소"
    role: "option"
    visible: true
  
  - selector: "sort-option-2"
    text: "조회순"
    role: "option"
    visible: true
```

### 방안 2: SpecNormalizer 개선 (자동 필터링)

위키 문서에서 자동으로 UI 텍스트만 추출:

```typescript
// 개선된 SpecNormalizer
function extractUIText(specText: string): string[] {
  const uiTexts: string[] = [];
  
  // 패턴 1: 따옴표로 감싼 텍스트
  const quoted = specText.match(/"([^"]+)"/g);
  if (quoted) {
    uiTexts.push(...quoted.map(q => q.replace(/"/g, '')));
  }
  
  // 패턴 2: 버튼/라벨 명시 패턴
  // "XXX 버튼", "XXX 라벨", "XXX 텍스트" 등
  const buttonPattern = /["']([^"']+)["']\s*(?:버튼|라벨|텍스트|노출)/g;
  // ...
  
  // 패턴 3: 메타데이터 제외
  // "Jira", "UUID", "작성자", "날짜" 등은 제외
  
  return uiTexts;
}
```

### 방안 3: 사용자 지정 비교 항목

UI에서 비교할 항목을 직접 선택:

```
[ ] "배포 예정일" (메타데이터 - 비교 제외)
[ ] "QA :" (메타데이터 - 비교 제외)
[✓] "필터" (UI 텍스트 - 비교 포함)
[✓] "정렬 선택" (UI 텍스트 - 비교 포함)
[ ] "Update History" (문서 구조 - 비교 제외)
```

## 권장 사용 방법

### 1단계: 위키 문서에서 UI 텍스트만 추출

위키 문서를 복사한 후, **실제 화면에 보이는 텍스트만** 남기고 나머지는 삭제:

**원본 위키 문서:**
```
배포 예정일: 2024-01-15
담당 기획자: 홍길동
담당 개발자: 김철수
QA: 이영희

디자인 링크: https://figma.com/...
지라 티켓: KWQA-21776

## 기능 설명
시간표 내 정렬 기능을 추가합니다.

## UI 요소
"필터" 버튼 노출
"정렬 선택" 섹션에 "원기소", "조회순" 옵션
```

**추출된 UI 텍스트 (비교용):**
```
"필터"
"정렬 선택"
"원기소"
"조회순"
```

### 2단계: Figma JSON과 비교

추출된 UI 텍스트만 입력하면 정확한 비교가 가능합니다.

## 개선 작업 계획

### 즉시 적용 가능한 개선

1. **SpecNormalizer 개선**
   - 따옴표로 감싼 텍스트만 추출
   - 메타데이터 패턴 자동 감지 및 제외
   - 문서 구조 텍스트 제외

2. **UI 개선**
   - "비교 제외 항목" 필터 옵션 추가
   - 메타데이터 자동 감지 및 제외 체크박스

### 중장기 개선

1. **구조화된 Spec 입력 지원**
   - YAML 형식 지원
   - SpecItem 직접 입력 UI

2. **스마트 필터링**
   - LLM을 활용한 UI 텍스트 자동 추출
   - 메타데이터 vs UI 텍스트 자동 분류

## 예시: 올바른 비교 방법

### 잘못된 방법 ❌

```
위키 문서 전체를 그대로 복사
→ 601건의 차이 (대부분 메타데이터)
```

### 올바른 방법 ✅

```
1. 위키 문서에서 UI 텍스트만 추출
   - 따옴표로 감싼 텍스트
   - 버튼명, 라벨명 등

2. 추출된 텍스트만 입력
   → 실제 UI 차이만 발견 (예: 10-20건)
```

## 결론

**위키 문서와 Figma는 서로 다른 목적**을 가지고 있으므로, 비교 전에 **UI 관련 텍스트만 추출**하는 것이 중요합니다.

현재 시스템은 모든 텍스트를 비교하도록 설계되어 있어, 메타데이터가 많은 경우 많은 false positive가 발생합니다.

**즉시 적용 가능한 해결책**: 위키 문서에서 따옴표로 감싼 텍스트나 명시적인 UI 텍스트만 추출하여 입력하세요.



# Figma 데이터 추출 방식 비교 가이드

## 추출 가능한 형식별 분석

### 1. Figma JSON (API/Plugin) ⭐ **권장**

**추출 방법:**
- Figma API: `GET /v1/files/{file_key}`
- Figma Plugin: "Export to JSON" 플러그인

**장점:**
- ✅ **가장 완전한 데이터**: 모든 노드, 속성, 메타데이터 포함
- ✅ **구조 정보**: 계층 구조, 위치, 크기, 스타일 모두 포함
- ✅ **텍스트 정보**: `characters` 필드에 모든 텍스트 포함
- ✅ **현재 시스템과 호환**: `FigmaNormalizer`가 바로 처리 가능
- ✅ **비교 정확도 높음**: selector, role, path 등 모든 정보 활용 가능

**단점:**
- ❌ API 토큰 필요 (Personal Access Token)
- ❌ 플러그인 설치 필요 (플러그인 사용 시)

**예시 데이터:**
```json
{
  "document": {
    "type": "FRAME",
    "name": "시간표 내 정렬 추가",
    "children": [
      {
        "type": "TEXT",
        "name": "Title",
        "characters": "필터",
        "absoluteBoundingBox": { "x": 0, "y": 0, "w": 100, "h": 50 }
      }
    ]
  }
}
```

**비교 활용도: ⭐⭐⭐⭐⭐ (5/5)**

---

### 2. CSS 코드 (Copy as code → CSS)

**추출 방법:**
- Figma에서 요소 선택 → 우클릭 → "Copy as" → "Copy as code" → "CSS"

**장점:**
- ✅ 스타일 정보 상세 (색상, 폰트, 간격 등)
- ✅ 웹 개발자에게 친숙한 형식

**단점:**
- ❌ 구조 정보 부족 (계층 구조, 텍스트 내용 제한적)
- ❌ 텍스트 내용 추출 어려움
- ❌ 현재 시스템과 직접 호환 안 됨 (추가 파서 필요)

**예시 데이터:**
```css
.filter-button {
  width: 100px;
  height: 50px;
  background-color: #000000;
  font-family: Inter;
  font-size: 16px;
}
```

**비교 활용도: ⭐⭐ (2/5)**
- 텍스트 비교에는 부적합
- 스타일 비교에만 유용

---

### 3. iOS 코드 (Copy as code → iOS)

**추출 방법:**
- Figma에서 요소 선택 → 우클릭 → "Copy as" → "Copy as code" → "iOS"

**장점:**
- ✅ 구조 정보 포함 (컴포넌트 계층)
- ✅ 텍스트 정보 포함 (`text` 속성)
- ✅ iOS 개발자에게 친숙

**단점:**
- ❌ Swift 코드 파싱 필요 (복잡함)
- ❌ 현재 시스템과 직접 호환 안 됨 (추가 파서 필요)
- ❌ 일부 메타데이터 누락 가능

**예시 데이터:**
```swift
let filterButton = UIButton()
filterButton.setTitle("필터", for: .normal)
filterButton.frame = CGRect(x: 0, y: 0, width: 100, height: 50)
```

**비교 활용도: ⭐⭐⭐ (3/5)**
- 텍스트 비교 가능하지만 파싱 복잡
- 구조 비교에 유용

---

### 4. Android 코드 (Copy as code → Android)

**추출 방법:**
- Figma에서 요소 선택 → 우클릭 → "Copy as" → "Copy as code" → "Android"

**장점:**
- ✅ 구조 정보 포함 (XML 레이아웃 또는 Kotlin 코드)
- ✅ 텍스트 정보 포함 (`android:text` 속성)
- ✅ Android 개발자에게 친숙

**단점:**
- ❌ XML/Kotlin 코드 파싱 필요 (복잡함)
- ❌ 현재 시스템과 직접 호환 안 됨 (추가 파서 필요)
- ❌ 일부 메타데이터 누락 가능

**예시 데이터:**
```xml
<Button
    android:id="@+id/filterButton"
    android:text="필터"
    android:layout_width="100dp"
    android:layout_height="50dp" />
```

**비교 활용도: ⭐⭐⭐ (3/5)**
- 텍스트 비교 가능하지만 파싱 복잡
- 구조 비교에 유용

---

## 권장 방식: 하이브리드 접근

### 전략 1: JSON 우선, 코드 보조 (권장) ⭐⭐⭐⭐⭐

```
1차: Figma JSON API 사용
  ↓ (가장 완전한 데이터)
FigmaNormalizer → UUMDocument
  ↓
비교 실행

2차: 코드 형식은 검증/보조용으로만 사용
  - CSS: 스타일 일치 여부 확인
  - iOS/Android: 플랫폼별 구현 검증
```

**장점:**
- 가장 정확한 비교 가능
- 현재 시스템 그대로 사용 가능
- 코드 형식은 추가 검증용으로 활용

---

### 전략 2: 다중 형식 지원 (향후 확장)

현재 시스템을 확장하여 여러 형식을 지원:

```
FigmaNormalizer (현재)
  ↓
FigmaCssNormalizer (신규)
FigmaIosNormalizer (신규)  
FigmaAndroidNormalizer (신규)
  ↓
모두 UUMDocument로 변환
  ↓
통합 비교
```

**구현 필요:**
- CSS 파서: 스타일 정보 추출
- Swift 파서: 구조 및 텍스트 추출
- XML/Kotlin 파서: 구조 및 텍스트 추출

**장점:**
- 다양한 입력 방식 지원
- 플랫폼별 상세 검증 가능

**단점:**
- 구현 복잡도 증가
- 파서 유지보수 필요

---

## 실제 사용 시나리오

### 시나리오 1: 기본 비교 (현재 방식)

```
1. Figma JSON API로 전체 파일 추출
2. Spec 텍스트 입력
3. 자동 비교 실행
```

**결과:**
- ✅ 텍스트 일치 여부
- ✅ 구조 일치 여부
- ✅ 요소 존재 여부

---

### 시나리오 2: 상세 검증 (향후 확장)

```
1. Figma JSON API로 전체 파일 추출 (기본 비교)
2. 특정 요소만 CSS/iOS/Android 코드로 추출
3. 코드 레벨에서 상세 검증
```

**결과:**
- ✅ 기본 비교 결과
- ✅ 스타일 일치 여부 (CSS)
- ✅ 플랫폼별 구현 정확도 (iOS/Android)

---

## 결론 및 권장사항

### 현재 단계에서는:

**✅ Figma JSON API 사용 (권장)**

이유:
1. 가장 완전한 데이터 제공
2. 현재 시스템과 완벽 호환
3. 비교 정확도 최고
4. 구현 복잡도 낮음

**사용 방법:**
```bash
# 1. Figma Personal Access Token 발급
# https://www.figma.com/developers/api#access-tokens

# 2. 파일 키 확인 (Figma URL에서)
# https://www.figma.com/file/{FILE_KEY}/...

# 3. API 호출
curl -H "X-Figma-Token: YOUR_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY" > figma.json

# 4. JSON을 UI에 붙여넣기
```

### 향후 확장 시:

**다중 형식 지원 추가**
- CSS 파서: 스타일 검증용
- iOS/Android 파서: 플랫폼별 구현 검증용
- JSON은 기본 비교용으로 유지

---

## 비교 정확도 예상

| 형식 | 텍스트 비교 | 구조 비교 | 스타일 비교 | 전체 점수 |
|------|------------|----------|------------|----------|
| **JSON** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **5.0** |
| CSS | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | 2.7 |
| iOS | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 3.3 |
| Android | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 3.3 |

**결론: JSON이 모든 면에서 우수하며, 코드 형식은 보조 검증용으로만 활용 권장**



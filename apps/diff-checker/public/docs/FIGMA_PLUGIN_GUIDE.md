# Figma Plugin을 사용한 JSON 추출 가이드 (API 한도 없음)

## 왜 Plugin을 사용해야 하나요?

### API 방식의 문제점
- ❌ **Rate Limit 제한**: Starter 플랜은 월 6회만 가능
- ❌ **토큰 관리 필요**: Personal Access Token 발급 및 관리 필요
- ❌ **네트워크 의존**: 인터넷 연결 필요

### Plugin 방식의 장점
- ✅ **무제한 사용**: API 한도에 영향 없음
- ✅ **간단한 사용**: 플러그인 설치 후 클릭 몇 번으로 완료
- ✅ **오프라인 가능**: Figma만 열려있으면 사용 가능
- ✅ **빠른 속도**: API 호출 대기 시간 없음

---

## 방법 1: Figma 공식 "Export to JSON" Plugin (권장)

### 1단계: Plugin 설치

1. **Figma 데스크톱 앱 또는 웹 브라우저에서 Figma 열기**
   - 데스크톱 앱 권장 (더 안정적)

2. **Figma 파일 열기**
   - JSON으로 추출하고 싶은 디자인 파일 열기

3. **Plugin 메뉴 열기**
   - 상단 메뉴: **Plugins** → **Browse plugins in Community**
   - 또는 단축키: `Cmd/Ctrl + /` → "Browse plugins" 입력

4. **Plugin 검색**
   - 검색창에 **"Export to JSON"** 입력
   - 또는 **"JSON Export"** 검색

5. **Plugin 선택 및 설치**
   - **"Export to JSON"** by Figma (공식 플러그인) 선택
   - 또는 **"JSON Export"** by various developers 선택
   - **Install** 또는 **Run** 버튼 클릭

### 2단계: JSON 추출

#### 옵션 A: 전체 파일 추출

1. **Plugin 실행**
   - **Plugins** → **Export to JSON** (또는 설치한 플러그인 이름)
   - 또는 `Cmd/Ctrl + /` → "Export to JSON" 입력

2. **옵션 선택**
   - **"Export entire file"** 또는 **"Export all frames"** 선택
   - 일부 플러그인은 자동으로 전체 파일을 추출

3. **JSON 복사**
   - 플러그인 창에서 **"Copy JSON"** 또는 **"Copy"** 버튼 클릭
   - JSON이 클립보드에 복사됨

#### 옵션 B: 특정 Frame/요소만 추출

1. **요소 선택**
   - 추출하고 싶은 Frame 또는 요소를 Figma 캔버스에서 선택
   - 여러 요소 선택: `Shift + 클릭` 또는 드래그로 영역 선택

2. **Plugin 실행**
   - 선택한 상태에서 **Plugins** → **Export to JSON** 실행

3. **JSON 복사**
   - 플러그인 창에서 **"Copy JSON"** 버튼 클릭

### 3단계: Diff Checker에 붙여넣기

1. **Diff Checker UI 열기**
   - `http://localhost:3000` 접속

2. **Figma 입력 섹션으로 이동**
   - "Figma 입력" 섹션 찾기

3. **JSON 붙여넣기**
   - 큰 텍스트 영역에 복사한 JSON 붙여넣기 (`Cmd/Ctrl + V`)
   - 또는 "샘플 붙여넣기" 버튼 옆의 텍스트 영역에 붙여넣기

4. **확인**
   - JSON이 올바르게 붙여넣어졌는지 확인
   - 유효한 JSON 형식인지 확인 (중괄호 `{}`로 시작하고 끝나야 함)

---

## 방법 2: "JSON Export" Plugin (대안)

### 설치 및 사용

1. **Plugin 검색**
   - Figma에서 **"JSON Export"** 검색
   - 여러 개발자가 만든 플러그인 중 선택

2. **설치 및 실행**
   - **Install** 클릭
   - **Plugins** → **JSON Export** 실행

3. **옵션 설정**
   - 일부 플러그인은 다음 옵션 제공:
     - **Include styles**: 스타일 정보 포함 여부
     - **Include images**: 이미지 정보 포함 여부
     - **Pretty print**: JSON 포맷팅 (가독성 향상)

4. **JSON 복사**
   - **Copy** 또는 **Export** 버튼 클릭

---

## 방법 3: "Figma to JSON" Plugin

### 특징
- 더 상세한 옵션 제공
- 커스터마이징 가능
- 다양한 출력 형식 지원

### 사용 방법

1. **Plugin 설치**
   - "Figma to JSON" 검색 및 설치

2. **설정**
   - 원하는 옵션 선택:
     - Include metadata
     - Include styles
     - Format output

3. **추출**
   - **Export** 클릭
   - JSON 복사

---

## 추출된 JSON 형식 확인

### 올바른 JSON 형식 예시

```json
{
  "document": {
    "id": "0:0",
    "name": "Document",
    "type": "DOCUMENT",
    "children": [
      {
        "id": "1:2",
        "name": "시간표 내 정렬 추가",
        "type": "FRAME",
        "children": [
          {
            "id": "1:3",
            "name": "Title",
            "type": "TEXT",
            "characters": "필터",
            "visible": true,
            "absoluteBoundingBox": {
              "x": 0,
              "y": 0,
              "width": 100,
              "height": 50
            }
          }
        ]
      }
    ]
  }
}
```

### 확인 사항

✅ **올바른 형식**:
- `{` 로 시작하고 `}` 로 끝남
- 모든 문자열이 따옴표로 감싸져 있음
- 쉼표가 올바르게 배치됨

❌ **잘못된 형식**:
- JSON이 아닌 일반 텍스트
- 중괄호가 누락됨
- 따옴표가 누락됨

---

## 문제 해결

### 문제 1: Plugin을 찾을 수 없음

**해결 방법**:
1. Figma가 최신 버전인지 확인
2. 다른 이름으로 검색 시도:
   - "JSON"
   - "Export"
   - "Data"
3. Community에서 직접 검색:
   - https://www.figma.com/community/plugins

### 문제 2: JSON이 너무 큼

**해결 방법**:
1. **특정 Frame만 선택**하여 추출
2. 큰 파일의 경우 일부만 추출:
   - 필요한 Frame만 선택
   - Plugin 실행
   - JSON 복사

### 문제 3: JSON 형식 오류

**해결 방법**:
1. **JSON 유효성 검사**:
   - 온라인 JSON Validator 사용
   - 또는 브라우저 콘솔에서 `JSON.parse()` 테스트

2. **다른 Plugin 시도**:
   - 다른 개발자가 만든 Plugin 사용
   - 각 Plugin의 출력 형식이 다를 수 있음

### 문제 4: Plugin이 실행되지 않음

**해결 방법**:
1. **Figma 재시작**
2. **Plugin 재설치**
3. **브라우저 캐시 삭제** (웹 버전 사용 시)
4. **다른 Plugin 시도**

---

## 추천 Plugin 목록

### 1. Export to JSON (Figma 공식)
- **장점**: 공식 플러그인, 안정적
- **단점**: 옵션이 제한적일 수 있음
- **링크**: Figma Community에서 검색

### 2. JSON Export (Community)
- **장점**: 다양한 옵션 제공
- **단점**: 여러 버전이 있어 선택 필요
- **링크**: Figma Community에서 검색

### 3. Figma to JSON
- **장점**: 상세한 커스터마이징 가능
- **단점**: 설정이 복잡할 수 있음
- **링크**: Figma Community에서 검색

---

## 단계별 체크리스트

### 설치 단계
- [ ] Figma 파일 열기
- [ ] Plugin 메뉴 열기 (`Plugins` → `Browse plugins`)
- [ ] "Export to JSON" 검색
- [ ] Plugin 설치

### 추출 단계
- [ ] 추출할 요소 선택 (전체 또는 일부)
- [ ] Plugin 실행
- [ ] 옵션 선택 (필요시)
- [ ] JSON 복사

### 사용 단계
- [ ] Diff Checker UI 열기
- [ ] Figma 입력 섹션으로 이동
- [ ] JSON 붙여넣기
- [ ] 형식 확인
- [ ] Run Diff 실행

---

## 팁과 트릭

### 팁 1: 자주 사용하는 Plugin 즐겨찾기
- Plugin 실행 후 **"Save to quick actions"** 선택
- 다음부터는 `Cmd/Ctrl + /`로 빠르게 실행 가능

### 팁 2: 큰 파일 처리
- 전체 파일이 너무 크면 **Frame 단위로 나누어 추출**
- 필요한 부분만 선택하여 추출

### 팁 3: JSON 검증
- 복사한 JSON을 메모장에 붙여넣어 형식 확인
- 온라인 JSON Validator 사용:
  - https://jsonlint.com/
  - https://jsonformatter.org/

### 팁 4: 자동화 (고급)
- 일부 Plugin은 **자동화 기능** 제공
- 여러 파일을 한 번에 처리 가능

---

## API 방식 vs Plugin 방식 비교

| 항목 | API 방식 | Plugin 방식 |
|------|----------|-------------|
| **요청 한도** | ❌ 제한 있음 (Starter: 월 6회) | ✅ 무제한 |
| **설치 필요** | ❌ 토큰 발급 필요 | ✅ Plugin 설치 필요 |
| **속도** | ⚠️ 네트워크 의존 | ✅ 즉시 |
| **오프라인** | ❌ 불가능 | ✅ 가능 |
| **사용 난이도** | ⚠️ 중간 (토큰 관리) | ✅ 쉬움 (클릭 몇 번) |
| **추출 범위** | ✅ 전체 파일 | ✅ 선택 가능 |
| **자동화** | ✅ 가능 (스크립트) | ⚠️ 제한적 |

---

## 결론

**Figma Plugin 사용을 강력히 권장합니다:**

1. ✅ **API 한도 문제 없음**
2. ✅ **사용이 간단함**
3. ✅ **빠르고 안정적**
4. ✅ **무제한 사용 가능**

특히 **Starter 플랜 사용자**나 **자주 테스트하는 경우**에는 Plugin 방식이 훨씬 효율적입니다.



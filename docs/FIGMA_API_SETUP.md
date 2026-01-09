# Figma JSON 추출 가이드

## 방법 1: Figma API 사용 (권장) ⭐

### 1단계: Personal Access Token 발급

1. Figma 계정 로그인
2. **Settings** → **Account** → **Personal access tokens** 이동
   - 또는 직접 링크: https://www.figma.com/settings
3. **Create new token** 클릭
4. 토큰 이름 입력 (예: "Diff Checker")
5. 토큰 복사 (한 번만 표시되므로 안전하게 보관)

### 2단계: 파일 키 확인

Figma 파일 URL에서 파일 키 추출:

```
https://www.figma.com/file/{FILE_KEY}/파일이름
```

예시:
- URL: `https://www.figma.com/file/abc123xyz/Design-System`
- 파일 키: `abc123xyz`

### 3단계: API 호출

#### 방법 A: curl 사용

```bash
curl -H "X-Figma-Token: YOUR_TOKEN" \
  "https://api.figma.com/v1/files/FILE_KEY" > figma.json
```

#### 방법 B: 브라우저에서 직접 호출

브라우저 주소창에 입력:
```
https://api.figma.com/v1/files/FILE_KEY
```

그리고 브라우저 확장 프로그램(예: ModHeader)으로 헤더 추가:
- Header: `X-Figma-Token`
- Value: `YOUR_TOKEN`

#### 방법 C: JavaScript/Node.js

```javascript
const response = await fetch('https://api.figma.com/v1/files/FILE_KEY', {
  headers: {
    'X-Figma-Token': 'YOUR_TOKEN'
  }
});
const data = await response.json();
console.log(JSON.stringify(data, null, 2));
```

### 4단계: JSON 사용

추출한 JSON을 Diff Checker UI의 "Figma JSON" 필드에 붙여넣기

---

## 방법 2: Figma Plugin 사용

### 1단계: Plugin 설치

1. Figma 열기
2. **Plugins** → **Browse plugins in Community** 클릭
3. 검색: "Export JSON" 또는 "JSON Export"
4. 추천 플러그인:
   - **"Export to JSON"** by Figma
   - **"JSON Export"** by various developers
5. **Install** 클릭

### 2단계: Plugin 실행

1. Figma 파일 열기
2. 추출할 Frame 또는 전체 파일 선택
3. **Plugins** → **Export to JSON** (또는 설치한 플러그인 이름)
4. 플러그인 창에서:
   - 옵션 선택 (전체 파일 또는 선택한 요소만)
   - **Export** 또는 **Copy** 클릭
5. JSON 복사 또는 파일 다운로드

### 3단계: JSON 사용

복사한 JSON을 Diff Checker UI의 "Figma JSON" 필드에 붙여넣기

---

## 방법 3: UI에 통합 (자동화)

Diff Checker UI에서 직접 Figma 파일을 가져오는 기능을 사용할 수 있습니다:

1. **Figma 파일 URL** 입력
2. **Personal Access Token** 입력 (처음 한 번만)
3. **가져오기** 버튼 클릭
4. 자동으로 JSON 추출 및 입력

---

## API 응답 예시

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

---

## 문제 해결

### 토큰이 작동하지 않을 때
- 토큰이 올바르게 복사되었는지 확인
- 토큰에 공백이 포함되지 않았는지 확인
- 토큰이 만료되지 않았는지 확인 (토큰은 만료되지 않지만, 재발급 필요할 수 있음)

### 파일 키를 찾을 수 없을 때
- Figma 파일 URL이 올바른지 확인
- 파일에 접근 권한이 있는지 확인

### API 호출 실패 시
- 네트워크 연결 확인
- 토큰 권한 확인
- 파일이 삭제되지 않았는지 확인

---

## 보안 주의사항

⚠️ **Personal Access Token은 비밀번호처럼 관리하세요:**
- 공개 저장소에 커밋하지 않기
- 환경 변수로 관리
- 필요시 토큰 재발급



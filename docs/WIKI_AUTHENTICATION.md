# 위키 인증 문제 해결 가이드

## 문제 상황

인증이 필요한 위키(Confluence, Notion 등)는 직접 URL 접근이 불가능합니다.

**현재 문제:**
- Confluence 위키 링크 입력 시 Atlassian 로그인 페이지 표시
- 인증 없이는 위키 내용을 가져올 수 없음

## 해결 방법

### 방법 1: Confluence API 사용 (권장) ⭐

Confluence REST API를 사용하여 인증된 방식으로 내용을 가져옵니다.

#### 1단계: Confluence API 토큰 발급

1. Confluence에 로그인
2. **설정** → **보안** → **API 토큰** 이동
3. **토큰 생성** 클릭
4. 토큰 이름 입력 (예: "Diff Checker")
5. 토큰 복사 (한 번만 표시됨)

#### 2단계: Confluence URL에서 정보 추출

Confluence 페이지 URL 형식:
```
https://your-domain.atlassian.net/wiki/spaces/{SPACE_KEY}/pages/{PAGE_ID}/페이지이름
```

또는:
```
https://your-domain.atlassian.net/wiki/pages/viewpage.action?pageId={PAGE_ID}
```

필요한 정보:
- **Base URL**: `https://your-domain.atlassian.net`
- **Space Key**: URL에서 추출
- **Page ID**: URL에서 추출
- **Email**: Confluence 계정 이메일
- **API Token**: 위에서 발급한 토큰

#### 3단계: API 호출

```bash
curl -u "your-email@example.com:API_TOKEN" \
  "https://your-domain.atlassian.net/wiki/rest/api/content/{PAGE_ID}?expand=body.storage"
```

---

### 방법 2: 수동 복사/붙여넣기 (간단)

1. 위키 페이지를 브라우저에서 열기
2. 내용을 선택하여 복사
3. Diff Checker의 "텍스트 입력" 탭에 붙여넣기

**장점:**
- 별도 설정 불필요
- 즉시 사용 가능

**단점:**
- 수동 작업 필요
- 자동화 불가

---

### 방법 3: Confluence API 통합 (향후 구현)

UI에서 Confluence 정보를 입력받아 API로 자동 가져오기:

**필요 정보:**
- Confluence Base URL
- 이메일
- API Token
- 페이지 URL 또는 Page ID

---

## 현재 상태

현재 구현은 **공개 위키**만 지원합니다:
- 인증이 필요 없는 위키
- 공개된 문서

**인증이 필요한 위키**는 다음 중 하나를 사용하세요:
1. **수동 복사/붙여넣기** (가장 간단)
2. **Confluence API 토큰 발급 후 API 사용** (자동화)

---

## 권장사항

**즉시 사용:**
- 위키 내용을 직접 복사하여 "텍스트 입력" 탭에 붙여넣기

**향후 개선:**
- Confluence API 통합 기능 추가
- Notion API 통합 기능 추가
- 사용자 인증 정보 입력 UI 추가



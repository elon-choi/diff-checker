# Figma Personal Access Token Scope 가이드

## Diff Checker에 필요한 최소 권한

### ✅ 필수 (반드시 체크)

**Files → `file_content:read`**
- **용도**: Figma 파일의 JSON 데이터를 읽기 위해 필요
- **설명**: "Read the contents of and render images from files"
- **이유**: Diff Checker가 Figma 파일의 구조, 텍스트, 요소 정보를 가져오기 위해 필수

### ✅ 권장 (체크하는 것이 좋음)

**Files → `file_metadata:read`**
- **용도**: 파일 정보 확인 (선택사항이지만 유용)
- **설명**: "Read metadata of files"
- **이유**: 파일 이름, 수정일 등 메타데이터 확인 가능

**Users → `current_user:read`**
- **용도**: 현재 사용자 정보 확인 (기본적으로 체크됨)
- **설명**: "Read the current user's name, email, and profile image"
- **이유**: API 호출 시 사용자 확인용

### ❌ 불필요 (체크 안 해도 됨)

**Files → `file_comments:read`**
- Diff Checker는 댓글 정보가 필요 없음

**Files → `file_comments:write`**
- 댓글 작성 권한이 필요 없음

**Files → `file_versions:read`**
- 버전 히스토리 정보가 필요 없음

**Design systems → `library_assets:read`**
- 디자인 시스템 라이브러리 정보가 필요 없음 (필요시에만 체크)

## 권장 설정

### 최소 권한 (보안 우선)
```
✅ Users → current_user:read
✅ Files → file_content:read
✅ Files → file_metadata:read (선택)
```

### 편의성 우선 (모든 파일 정보 접근)
```
✅ Users → current_user:read
✅ Files → file_content:read
✅ Files → file_metadata:read
✅ Files → file_versions:read (버전 정보 필요시)
```

## 보안 원칙

**최소 권한 원칙 (Principle of Least Privilege)**
- 필요한 최소한의 권한만 부여
- `file_content:read`만으로도 Diff Checker 사용 가능
- 불필요한 권한은 보안 위험 증가

## 실제 사용 예시

### Scenario 1: 기본 사용 (최소 권한)
```
✅ current_user:read
✅ file_content:read
```
→ Figma 파일 JSON 추출 가능 ✅

### Scenario 2: 추가 정보 필요시
```
✅ current_user:read
✅ file_content:read
✅ file_metadata:read
```
→ 파일 정보 + 내용 모두 확인 가능 ✅

## 주의사항

⚠️ **`file_content:read`는 반드시 필요합니다**
- 이 권한 없이는 파일 내용을 읽을 수 없어 Diff Checker가 작동하지 않습니다

⚠️ **토큰 만료일 확인**
- 기본 90일이지만 필요시 더 짧게 설정 가능
- 만료되면 새 토큰 발급 필요



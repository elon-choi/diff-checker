# UI 보호 시스템 설정 가이드

## 개요

UI 보호 시스템은 AI 어시스턴트가 사용자 명시적 요청 없이 UI를 변경하거나 삭제하는 것을 방지하기 위한 시스템입니다.

## 구성 요소

### 1. 보호 주석 (UI PROTECTED)
- 모든 UI 컴포넌트에 `⚠️ UI PROTECTED` 주석 추가
- 변경 시 경고 표시

### 2. Git 보호 (.gitattributes)
- UI 파일을 보호 영역으로 지정
- 변경 추적 용이

### 3. 스냅샷 테스트 (Playwright)
- UI 변경 시 자동 감지
- 시각적 회귀 방지

## 사용 방법

### 스냅샷 테스트 실행

```bash
# UI 스냅샷 테스트 실행
pnpm test:ui

# 스냅샷 업데이트 (UI 변경 후)
pnpm test:ui:update

# UI 모드로 테스트 실행 (시각적 확인)
pnpm test:ui:ui
```

### UI 변경 프로세스

1. **변경 전**: 현재 스냅샷 확인
   ```bash
   pnpm test:ui
   ```

2. **UI 변경**: 사용자 명시적 요청에 따라 변경

3. **변경 후 검증**: 스냅샷 업데이트 및 확인
   ```bash
   pnpm test:ui:update
   pnpm test:ui
   ```

4. **의도하지 않은 변경 감지 시**: 즉시 원복

## 보호 대상 파일

- `apps/diff-checker/app/page.tsx` - Next.js 앱 메인 UI (단일 앱)
- 향후 분리될 UI 컴포넌트들

## 스냅샷 저장 위치

- `tests/ui-snapshots/ui-protection.spec.ts-snapshots/`

## 주의사항

⚠️ **중요**: 스냅샷이 변경되면 UI가 변경된 것입니다.
- 의도한 변경: `pnpm test:ui:update`로 스냅샷 업데이트
- 의도하지 않은 변경: 즉시 원복 및 원인 파악

## CI/CD 통합 (향후)

```yaml
# .github/workflows/ui-protection.yml
- name: UI 스냅샷 테스트
  run: pnpm test:ui
```

## 문제 해결

### 스냅샷이 계속 실패하는 경우
1. 개발 서버가 실행 중인지 확인 (`pnpm dev:next`)
2. 브라우저가 설치되었는지 확인 (`pnpm exec playwright install`)
3. 스냅샷 파일이 올바른지 확인
4. Next.js 앱이 `http://localhost:3000`에서 실행 중인지 확인

### 스냅샷 업데이트가 필요한 경우
- UI를 의도적으로 변경한 경우에만 `pnpm test:ui:update` 실행
- 변경 사항을 문서화하고 커밋

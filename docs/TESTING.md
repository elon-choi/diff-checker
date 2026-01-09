# 테스트 가이드

본 가이드는 규칙 검증과 수집기, CLI, Next 앱을 사용한 수동 테스트 절차를 제공합니다.

## 사전 준비
- 워크스페이스 루트에서 의존성 설치:
  - `pnpm install`
- Playwright 설치 및 브라우저 준비:
  - `pnpm dlx playwright install`

## Web DOM 스냅샷 수집(헤드풀 모드)
Playwright UI가 보이는 상태(headed)로 DOM 스냅샷을 생성합니다.

1) 페이지 스냅샷 생성
- `packages/collectors/web-collector`를 사용하여 `resources/samples/web_dom.json`로 저장하세요.
- 코드 내 `WebCollector.collect(url, outPath, { headed: true })` 사용.

예시 (ts-node/tsx 사용 시):
```ts
import { WebCollector } from '../../packages/collectors/web-collector/src/index';
await WebCollector.collect('http://localhost:3000', 'resources/samples/web_dom.json', { headed: true });
```

## CLI로 Diff 실행 (Phase 2)
`configs/project.config.yaml`에 샘플 경로가 설정되어 있습니다.

1) 루트에서 실행:
```bash
pnpm -F @diff-checker/cli start
```

2) 결과
- `reports/phase-2.md`가 생성되며, TEXT/MISSING/VISIBILITY/POLICY/STRUCTURE 규칙 결과가 포함됩니다.

## Next 앱에서 수동 검증
1) Dev 서버:
```bash
pnpm -F @diff-checker/next dev
```
2) 브라우저에서 `http://localhost:3000` 접속:
- Spec/Figma/Web/Android/iOS 입력 필드를 채운 뒤 Run Diff.
- Export Markdown으로 결과 저장 가능.

## 검증 포인트
- selector 우선 매칭 동작 확인(PO 기반 selector 반영).
- 노출 요구(STATE: show) 문구에 대해 VISIBILITY/MISSING_ELEMENT 판별.
- TEXT_MISMATCH에서 유사/불일치 케이스 확인.








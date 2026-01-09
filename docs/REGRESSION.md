# 회귀/성능 측정 가이드

목표: 1회 Diff 실행 ≤ 3초 (Guideline v1)

## 데이터셋
- 샘플:
  - `resources/samples/spec.md`
  - `resources/samples/figma.json`
  - `resources/samples/web_dom.json`
- 필요 시 WebCollector로 실제 페이지 스냅샷을 갱신하세요.

## 측정 절차 (수동)
1) CLI로 N회 실행 (예: 10회)
```bash
time pnpm -F @diff-checker/cli start
```
2) 평균/최대 실행 시간 기록
- 시스템 부하가 낮은 상태에서 재현
- 결과 보고서(`reports/phase-*.md`) 사이즈/Findings 개수도 기록

## 기준 및 실패 처리
- 평균 ≤ 3초, 최대 ≤ 5초 권장
- 기준 초과 시:
  - Normalizer에서 불필요한 순회/파싱 제거
  - 규칙에서 O(n^2) 영역이 있는지 점검
  - 필요 시 캐싱/프루닝 추가

## 회귀 방지
- 샘플 입력/출력(Findings 요약)을 버전 관리
- 규칙 변경 시 기존 샘플에 대한 결과 차이를 리뷰(PR)로 확인








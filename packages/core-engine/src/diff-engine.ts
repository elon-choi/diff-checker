import {
  UUMDocument,
  SpecItem,
  DiffFinding,
  Platform,
} from './types';

export interface DiffRule {
  id: string;
  description: string;
  apply(
    docs: UUMDocument[],
    specItems: SpecItem[]
  ): DiffFinding[];
}

export class DiffEngine {
  constructor(
    private rules: DiffRule[],
    private llm?: { refine: (findings: DiffFinding[], docs: UUMDocument[], specItems: SpecItem[]) => DiffFinding[] | Promise<DiffFinding[]> }
  ) {}

  async runPhase(
    phase: 1 | 2 | 3 | 4,
    inputs: {
      spec: UUMDocument;
      figma?: UUMDocument;
      web?: UUMDocument;
      android?: UUMDocument;
      ios?: UUMDocument;
    },
    specItems: SpecItem[]
  ): Promise<DiffFinding[]> {
    // Guardrail: SpecItems(TEXT) 개수 < 5 이면 Diff 실행하지 않음
    // 단, 표 기반 SpecItem이 존재하면 비교를 진행
    const textSpecItems = specItems.filter((item) => item.kind === 'TEXT' && item.text);
    const hasTableItems = specItems.some((item) => item.meta?.source === 'table');
    if (textSpecItems.length < 5 && !hasTableItems) {
      return [{
        id: 'guardrail:spec-items-insufficient',
        severity: 'CRITICAL',
        category: 'STRUCTURE',
        description: `Spec에서 UI 텍스트를 거의 추출하지 못했습니다. 표 파싱 / 섹션 선택 / 필터 규칙을 확인하세요. (추출된 TEXT 항목: ${textSpecItems.length}개)`,
        evidence: {
          textSpecItemsCount: textSpecItems.length,
          totalSpecItemsCount: specItems.length,
        },
        decisionMetadata: {
          decision_reason_code: 'SPEC_EXTRACT_EMPTY',
          decision_explanation: `SpecItems(TEXT) 개수가 ${textSpecItems.length}개로 5개 미만입니다. Diff를 실행하지 않습니다.`,
        },
      }];
    }

    const docs = Object.values(inputs).filter(Boolean) as UUMDocument[];
    let findings = this.rules.flatMap((r) => r.apply(docs, specItems));
    if (this.llm) {
      const refined = this.llm.refine(findings, docs, specItems);
      findings = refined instanceof Promise ? await refined : refined;
    }
    return findings;
  }
}



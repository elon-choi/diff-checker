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
      figma: UUMDocument;
      web?: UUMDocument;
      android?: UUMDocument;
      ios?: UUMDocument;
    },
    specItems: SpecItem[]
  ): Promise<DiffFinding[]> {
    const docs = Object.values(inputs).filter(Boolean) as UUMDocument[];
    let findings = this.rules.flatMap((r) => r.apply(docs, specItems));
    if (this.llm) {
      const refined = this.llm.refine(findings, docs, specItems);
      findings = refined instanceof Promise ? await refined : refined;
    }
    return findings;
  }
}



import { DiffFinding } from '../../../core-engine/src/types';

export function toMarkdown(findings: DiffFinding[], phase: number): string {
  const header = `# Phase ${phase} Diff Report\n총 ${findings.length}건\n`;
  const rows = findings.map(
    (f) => `- [${f.severity}] (${f.category}) ${f.description}`
  );
  return [header, ...rows].join('\n');
}



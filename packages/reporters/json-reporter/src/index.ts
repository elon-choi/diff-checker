import { DiffFinding } from '../../../core-engine/src/types';

export interface JsonReport {
  phase: number;
  summary: {
    total: number;
    bySeverity: {
      CRITICAL: number;
      MAJOR: number;
      MINOR: number;
      INFO: number;
    };
  };
  findings: DiffFinding[];
  generatedAt: string;
}

export function toJson(findings: DiffFinding[], phase: number): string {
  const summary = {
    total: findings.length,
    bySeverity: {
      CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
      MAJOR: findings.filter((f) => f.severity === 'MAJOR').length,
      MINOR: findings.filter((f) => f.severity === 'MINOR').length,
      INFO: findings.filter((f) => f.severity === 'INFO').length,
    },
  };

  const report: JsonReport = {
    phase,
    summary,
    findings,
    generatedAt: new Date().toISOString(),
  };

  return JSON.stringify(report, null, 2);
}



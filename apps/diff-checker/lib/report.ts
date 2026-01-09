import { Finding } from './diff';
import { toMarkdown as sharedToMarkdown } from '@diff-checker/markdown-reporter';
import { toHtml as sharedToHtml } from '@diff-checker/html-reporter';

// 앱 로컬 Finding은 core DiffFinding과 동일 필드를 사용하므로 매핑 없이 재사용
export function toMarkdown(findings: Finding[], phase: number): string {
  return sharedToMarkdown(findings as any, phase);
}

export function toHtml(findings: Finding[], phase: number): string {
  return sharedToHtml(findings as any, phase);
}




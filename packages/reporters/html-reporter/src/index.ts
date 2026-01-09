import { DiffFinding } from '../../../core-engine/src/types';

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return '#dc2626';
    case 'MAJOR':
      return '#ea580c';
    case 'MINOR':
      return '#ca8a04';
    case 'INFO':
      return '#6b7280';
    default:
      return '#6b7280';
  }
}

export function toHtml(findings: DiffFinding[], phase: number): string {
  const severityOrder: Record<string, number> = {
    CRITICAL: 0,
    MAJOR: 1,
    MINOR: 2,
    INFO: 3,
  };
  const sortedFindings = [...findings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  const summary = {
    total: findings.length,
    CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
    MAJOR: findings.filter((f) => f.severity === 'MAJOR').length,
    MINOR: findings.filter((f) => f.severity === 'MINOR').length,
    INFO: findings.filter((f) => f.severity === 'INFO').length,
  };

  const findingsRows = sortedFindings
    .map(
      (f) => `
    <tr>
      <td style="color: ${getSeverityColor(f.severity)}; font-weight: 600;">${escapeHtml(f.severity)}</td>
      <td>${escapeHtml(f.category)}</td>
      <td>${escapeHtml(f.description)}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phase ${phase} Diff Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9fafb;
    }
    h1 {
      color: #111827;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 24px 0;
    }
    .summary-card {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    .summary-card .label {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .summary-card .value {
      font-size: 24px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    thead {
      background-color: #f3f4f6;
    }
    th {
      text-align: left;
      padding: 12px;
      font-weight: 600;
      color: #374151;
      font-size: 14px;
    }
    td {
      padding: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
    }
    tbody tr:hover {
      background-color: #f9fafb;
    }
    .meta {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <h1>Phase ${phase} Diff Report</h1>
  
  <div class="summary">
    <div class="summary-card">
      <div class="label">CRITICAL</div>
      <div class="value" style="color: #dc2626;">${summary.CRITICAL}</div>
    </div>
    <div class="summary-card">
      <div class="label">MAJOR</div>
      <div class="value" style="color: #ea580c;">${summary.MAJOR}</div>
    </div>
    <div class="summary-card">
      <div class="label">MINOR</div>
      <div class="value" style="color: #ca8a04;">${summary.MINOR}</div>
    </div>
    <div class="summary-card">
      <div class="label">INFO</div>
      <div class="value" style="color: #6b7280;">${summary.INFO}</div>
    </div>
  </div>

  <h2>Findings (총 ${summary.total}건)</h2>
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Category</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      ${findingsRows}
    </tbody>
  </table>

  <div class="meta">
    생성 시간: ${new Date().toLocaleString('ko-KR')}
  </div>
</body>
</html>`;
}



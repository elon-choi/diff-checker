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
    case 'WARN':
      return '#ca8a04';
    case 'MINOR':
      return '#2563eb';
    case 'INFO':
      return '#6b7280';
    default:
      return '#6b7280';
  }
}

function getActionLabel(action?: string): string {
  switch (action) {
    case 'spec-update':
      return '스펙 수정';
    case 'design-update':
      return '디자인 수정';
    case 'ignore-noise':
      return '노이즈로 무시';
    default:
      return '확인 필요';
  }
}

function getActionColor(action?: string): string {
  switch (action) {
    case 'spec-update':
      return '#3b82f6';
    case 'design-update':
      return '#ea580c';
    case 'ignore-noise':
      return '#6b7280';
    default:
      return '#9ca3af';
  }
}

/**
 * Findings를 요구사항 단위로 그룹화
 */
function groupByRequirement(findings: DiffFinding[]): Map<string, DiffFinding[]> {
  const groups = new Map<string, DiffFinding[]>();
  
  for (const finding of findings) {
    const section = finding.meta?.section || '기타';
    const feature = finding.meta?.feature || finding.id;
    const key = `${section}::${feature}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(finding);
  }
  
  return groups;
}

export function toHtml(findings: DiffFinding[], phase: number): string {
  const severityOrder: Record<string, number> = {
    CRITICAL: 0,
    MAJOR: 1,
    WARN: 2,
    MINOR: 3,
    INFO: 4,
  };
  const sortedFindings = [...findings].sort(
    (a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
  );

  const summary = {
    total: findings.length,
    CRITICAL: findings.filter((f) => f.severity === 'CRITICAL').length,
    MAJOR: findings.filter((f) => f.severity === 'MAJOR').length,
    WARN: findings.filter((f) => f.severity === 'WARN').length,
    MINOR: findings.filter((f) => f.severity === 'MINOR').length,
    INFO: findings.filter((f) => f.severity === 'INFO').length,
  };

  // 요구사항 단위로 그룹화
  const requirementGroups = groupByRequirement(findings);
  
  // Summary 탭 내용
  const summaryContent = `
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
        <div class="label">WARN</div>
        <div class="value" style="color: #ca8a04;">${summary.WARN}</div>
      </div>
      <div class="summary-card">
        <div class="label">MINOR</div>
        <div class="value" style="color: #2563eb;">${summary.MINOR}</div>
      </div>
      <div class="summary-card">
        <div class="label">INFO</div>
        <div class="value" style="color: #6b7280;">${summary.INFO}</div>
      </div>
    </div>
    <div class="info-box">
      <h3>📊 요약</h3>
      <ul>
        <li>총 ${summary.total}건의 차이 발견</li>
        <li>요구사항 단위 그룹: ${requirementGroups.size}개</li>
        <li>노이즈 필터링 적용됨</li>
      </ul>
    </div>
  `;

  // By Requirement 탭 내용
  const requirementRows: string[] = [];
  let requirementIndex = 0;
  
  for (const [key, groupFindings] of requirementGroups.entries()) {
    const [section, feature] = key.split('::');
    requirementIndex++;
    
    const groupSummary = {
      total: groupFindings.length,
      CRITICAL: groupFindings.filter(f => f.severity === 'CRITICAL').length,
      MAJOR: groupFindings.filter(f => f.severity === 'MAJOR').length,
      WARN: groupFindings.filter(f => f.severity === 'WARN').length,
      MINOR: groupFindings.filter(f => f.severity === 'MINOR').length,
      INFO: groupFindings.filter(f => f.severity === 'INFO').length,
    };
    
    const findingsDetails = groupFindings.map(f => {
      const figmaText = f.evidence?.figmaText || f.evidence?.expected || '';
      const specItem = f.evidence?.specItem;
      const specText = specItem?.text || f.evidence?.expected || f.meta?.section || '';
      const candidates = f.evidence?.candidates || [];
      const ruleName = f.meta?.ruleName || f.decisionMetadata?.rule_name || 'unknown';
      const ruleReason = f.meta?.ruleReason || f.decisionMetadata?.decision_explanation || '';
      const action = f.meta?.recommendedAction;
      
      return `
        <div class="finding-detail">
          <div class="finding-header">
            <span class="severity-badge" style="background-color: ${getSeverityColor(f.severity)}">
              ${f.severity}
            </span>
            <span class="finding-description">${escapeHtml(f.description)}</span>
          </div>
          <div class="evidence-section">
            <div class="evidence-item">
              <strong>📋 Spec 원문:</strong>
              <div class="evidence-content">
                ${specText ? `<div style="font-weight: 500; margin-bottom: 4px;">${escapeHtml(specText)}</div>` : '<div style="color: #9ca3af;">N/A</div>'}
                ${specItem?.meta?.section ? `<span class="meta-tag">섹션: ${escapeHtml(specItem.meta.section)}</span>` : f.meta?.section ? `<span class="meta-tag">섹션: ${escapeHtml(f.meta.section)}</span>` : ''}
                ${specItem?.meta?.row ? `<span class="meta-tag">행: ${specItem.meta.row}</span>` : f.meta?.row ? `<span class="meta-tag">행: ${f.meta.row}</span>` : ''}
                ${specItem?.meta?.feature ? `<span class="meta-tag">기능: ${escapeHtml(specItem.meta.feature)}</span>` : f.meta?.feature ? `<span class="meta-tag">기능: ${escapeHtml(f.meta.feature)}</span>` : ''}
              </div>
            </div>
            <div class="evidence-item">
              <strong>🎨 Figma 매칭 후보:</strong>
              <div class="evidence-content">
                ${candidates.length > 0 
                  ? candidates.map((c: any, idx: number) => `
                    <div class="candidate-item">
                      <span class="candidate-rank">#${idx + 1}</span>
                      <span class="candidate-text">${escapeHtml(c.text || 'N/A')}</span>
                      <span class="candidate-similarity">유사도: ${((c.similarity || 0) * 100).toFixed(0)}%</span>
                      ${c.specId ? `<span class="meta-tag" style="margin-left: 8px;">${escapeHtml(c.specId.substring(0, 20))}</span>` : ''}
                    </div>
                  `).join('')
                  : `<div class="candidate-item" style="color: #9ca3af;">매칭 후보 없음</div>`
                }
              </div>
            </div>
            <div class="evidence-item">
              <strong>⚖️ 판정 룰:</strong>
              <div class="evidence-content">
                <span class="rule-name">${escapeHtml(ruleName)}</span>
                <span class="rule-reason">${escapeHtml(ruleReason)}</span>
              </div>
            </div>
            <div class="evidence-item">
              <strong>💡 추천 액션:</strong>
              <div class="evidence-content">
                <span class="action-badge" style="background-color: ${getActionColor(action)}">
                  ${getActionLabel(action)}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    requirementRows.push(`
      <div class="requirement-group">
        <div class="requirement-header">
          <h3>${requirementIndex}. ${escapeHtml(section)} - ${escapeHtml(feature)}</h3>
          <div class="requirement-summary">
            <span class="badge critical">CRITICAL: ${groupSummary.CRITICAL}</span>
            <span class="badge major">MAJOR: ${groupSummary.MAJOR}</span>
            <span class="badge warn">WARN: ${groupSummary.WARN}</span>
            <span class="badge minor">MINOR: ${groupSummary.MINOR}</span>
            <span class="badge info">INFO: ${groupSummary.INFO}</span>
            <span class="badge total">총 ${groupSummary.total}건</span>
          </div>
        </div>
        <div class="requirement-findings">
          ${findingsDetails}
        </div>
      </div>
    `);
  }
  
  const requirementContent = requirementRows.join('');

  // Raw 탭 내용
  const rawRows = sortedFindings
    .map(
      (f) => `
    <tr>
      <td style="color: ${getSeverityColor(f.severity)}; font-weight: 600;">${escapeHtml(f.severity)}</td>
      <td>${escapeHtml(f.category)}</td>
      <td>${escapeHtml(f.description)}</td>
      <td>${escapeHtml(f.meta?.ruleName || 'N/A')}</td>
      <td>${escapeHtml(f.meta?.section || 'N/A')}</td>
    </tr>
  `
    )
    .join('');

  const rawContent = `
    <table>
      <thead>
        <tr>
          <th>Severity</th>
          <th>Category</th>
          <th>Description</th>
          <th>Rule</th>
          <th>Section</th>
        </tr>
      </thead>
      <tbody>
        ${rawRows}
      </tbody>
    </table>
  `;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phase ${phase} Diff Report</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9fafb;
    }
    h1 {
      color: #111827;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
      margin-bottom: 24px;
    }
    h2 {
      color: #374151;
      margin-top: 32px;
      margin-bottom: 16px;
    }
    h3 {
      color: #4b5563;
      margin-top: 0;
      margin-bottom: 12px;
    }
    
    /* 탭 UI */
    .tabs {
      display: flex;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 24px;
    }
    .tab {
      padding: 12px 24px;
      cursor: pointer;
      border: none;
      background: none;
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all 0.2s;
    }
    .tab:hover {
      color: #374151;
      background-color: #f9fafb;
    }
    .tab.active {
      color: #111827;
      border-bottom-color: #111827;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    
    /* Summary */
    .summary {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
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
    .info-box {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .info-box ul {
      margin: 12px 0;
      padding-left: 24px;
    }
    .info-box li {
      margin: 8px 0;
    }
    
    /* Requirement Groups */
    .requirement-group {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .requirement-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .requirement-summary {
      display: flex;
      gap: 8px;
    }
    .badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.critical {
      background-color: #fee2e2;
      color: #991b1b;
    }
    .badge.major {
      background-color: #fed7aa;
      color: #9a3412;
    }
    .badge.minor {
      background-color: #fef3c7;
      color: #854d0e;
    }
    .badge.warn {
      background-color: #fef3c7;
      color: #854d0e;
    }
    .badge.info {
      background-color: #e5e7eb;
      color: #374151;
    }
    .badge.total {
      background-color: #e0e7ff;
      color: #3730a3;
    }
    
    /* Finding Details */
    .finding-detail {
      background: #f9fafb;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .finding-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .severity-badge {
      padding: 4px 8px;
      border-radius: 4px;
      color: white;
      font-size: 11px;
      font-weight: 600;
    }
    .finding-description {
      flex: 1;
      font-weight: 500;
    }
    .evidence-section {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-top: 12px;
    }
    .evidence-item {
      background: white;
      padding: 12px;
      border-radius: 4px;
    }
    .evidence-item strong {
      display: block;
      margin-bottom: 8px;
      color: #374151;
      font-size: 13px;
    }
    .evidence-content {
      font-size: 13px;
      color: #6b7280;
    }
    .meta-tag {
      display: inline-block;
      background: #e5e7eb;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-left: 8px;
    }
    .candidate-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .candidate-item:last-child {
      border-bottom: none;
    }
    .candidate-rank {
      background: #dbeafe;
      color: #1e40af;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .candidate-text {
      flex: 1;
      font-weight: 500;
    }
    .candidate-similarity {
      font-size: 11px;
      color: #6b7280;
    }
    .rule-name {
      display: inline-block;
      background: #f3f4f6;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      margin-right: 8px;
    }
    .rule-reason {
      font-size: 12px;
      color: #6b7280;
    }
    .action-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      font-weight: 500;
    }
    
    /* Raw Table */
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
  
  <div class="tabs">
    <button class="tab active" onclick="showTab('summary')">Summary</button>
    <button class="tab" onclick="showTab('requirement')">By Requirement</button>
    <button class="tab" onclick="showTab('raw')">Raw</button>
  </div>
  
  <div id="summary" class="tab-content active">
    ${summaryContent}
  </div>
  
  <div id="requirement" class="tab-content">
    <h2>요구사항 단위 그룹화 (${requirementGroups.size}개 그룹)</h2>
    ${requirementContent}
  </div>
  
  <div id="raw" class="tab-content">
    <h2>Raw Findings (총 ${summary.total}건)</h2>
    ${rawContent}
  </div>

  <div class="meta">
    생성 시간: ${new Date().toLocaleString('ko-KR')}
  </div>
  
  <script>
    function showTab(tabName) {
      // 모든 탭과 콘텐츠 숨기기
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      
      // 선택된 탭과 콘텐츠 표시
      event.target.classList.add('active');
      document.getElementById(tabName).classList.add('active');
    }
  </script>
</body>
</html>`;
}

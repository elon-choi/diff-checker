import React, { useMemo, useState } from 'react';

/**
 * Diff Checker Dashboard (Client-only mock)
 * - Notion-style input panel + PR-style result panel
 * - No external deps beyond Tailwind. Drop straight into Next.js or CRA.
 * - Phase 1~4 inputs supported (Spec/Figma/Web/Android/iOS)
 * - Minimal, front-end-only diff to demo UX. Replace `runDiff()` with API calls later.
 */

// ----------------------------- Types -----------------------------

type Platform = 'SPEC' | 'FIGMA' | 'WEB' | 'ANDROID' | 'IOS';

type Phase = 1 | 2 | 3 | 4;

type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';

type Category = 'TEXT_MISMATCH' | 'MISSING_ELEMENT' | 'VISIBILITY' | 'POLICY' | 'STRUCTURE';

interface Finding {
  id: string;
  selector?: string;
  severity: Severity;
  category: Category;
  description: string;
  evidence?: Record<string, any>;
}

// Very small UUM-like node for front-end demo
interface UUMNode {
  platform: Platform;
  role?: string;
  name?: string;
  text?: string;
  visible?: boolean;
  path?: string;
}

interface UUMDoc {
  platform: Platform;
  nodes: UUMNode[];
}

// ----------------------------- Utility -----------------------------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeText(s?: string) {
  if (!s) return '';
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

function similarity(a: string, b: string) {
  // Simple Jaccard on word sets (demo-grade)
  const A = new Set(a.split(' '));
  const B = new Set(b.split(' '));
  const inter = new Set([...A].filter(x => B.has(x))).size;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}

// ----------------------------- Demo Normalizers -----------------------------

/** SPEC normalizer (demo)
 * Accepts raw markdown/text. Each non-empty line is a spec line (TEXT kind).
 */
function specToDoc(specText: string): UUMDoc {
  const lines = specText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  const nodes: UUMNode[] = lines.map((line, i) => ({
    platform: 'SPEC',
    role: 'TEXT',
    text: line,
    path: `/spec/${i + 1}`,
  }));
  return { platform: 'SPEC', nodes };
}

/** FIGMA normalizer (demo)
 * Accepts a JSON with array of nodes that may contain `characters` and `name`.
 * Real-world: use Figma REST API JSON → traverse nodes recursively.
 */
function figmaJsonToDoc(figma: any): UUMDoc {
  const nodes: UUMNode[] = [];
  function walk(node: any, path: string[] = []) {
    if (!node || typeof node !== 'object') return;
    const thisPath = [...path, node.name || node.type || 'NODE'];
    if (node.characters || node.name) {
      nodes.push({
        platform: 'FIGMA',
        role: node.type === 'TEXT' ? 'TEXT' : undefined,
        name: node.name,
        text: node.characters || undefined,
        path: '/' + thisPath.join('/'),
        visible: node.visible !== false,
      });
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach((c: any) => walk(c, thisPath));
    }
    if (Array.isArray(node)) node.forEach((c) => walk(c, path));
  }
  walk(figma, []);
  return { platform: 'FIGMA', nodes };
}

/** WEB normalizer (demo)
 * Accepts a JSON with array of visible elements: { text, role, id, className }
 * Real-world: capture via Playwright script → DOM JSON.
 */
function webJsonToDoc(web: any): UUMDoc {
  const nodes: UUMNode[] = [];
  const list = Array.isArray(web?.elements) ? web.elements : [];
  for (const el of list) {
    if (!el?.text) continue;
    nodes.push({
      platform: 'WEB',
      role: el.role || undefined,
      name: el.id || el.className || undefined,
      text: el.text,
      visible: el.visible !== false,
      path: '/dom',
    });
  }
  return { platform: 'WEB', nodes };
}

/** ANDROID / IOS normalizers (demo)
 * Accepts a JSON array of nodes that have { text, resourceId, visible }
 */
function mobileJsonToDoc(anyJson: any, platform: 'ANDROID' | 'IOS'): UUMDoc {
  const nodes: UUMNode[] = [];
  const list = Array.isArray(anyJson?.nodes) ? anyJson.nodes : [];
  for (const n of list) {
    if (!n?.text && !n?.name) continue;
    nodes.push({
      platform,
      role: n.role || undefined,
      name: n.resourceId || n.name || undefined,
      text: n.text || undefined,
      visible: n.visible !== false,
      path: n.path || '/view',
    });
  }
  return { platform, nodes };
}

// ----------------------------- Diff (demo rules) -----------------------------

function runDiff(
  phase: Phase,
  specDoc?: UUMDoc,
  figmaDoc?: UUMDoc,
  webDoc?: UUMDoc,
  androidDoc?: UUMDoc,
  iosDoc?: UUMDoc
): Finding[] {
  const findings: Finding[] = [];
  const THRESH = 0.9; // text similarity threshold

  const compareSpecTo = (target?: UUMDoc, targetLabel?: string) => {
    if (!specDoc || !target) return;
    for (const s of specDoc.nodes) {
      if (!s.text) continue;
      const sNorm = normalizeText(s.text);

      // Try exact & similar match among target nodes
      let best: UUMNode | null = null;
      let bestSim = -1;
      for (const t of target.nodes) {
        const sim = similarity(sNorm, normalizeText(t.text));
        if (sim > bestSim) {
          bestSim = sim;
          best = t;
        }
      }

      if (!best || bestSim < 0.1) {
        findings.push({
          id: uid(),
          severity: 'MAJOR',
          category: 'MISSING_ELEMENT',
          description: `Spec 문구를 ${targetLabel}에서 찾지 못함: "${s.text}"`,
          evidence: { spec: s, target }
        });
        continue;
      }

      if (bestSim < THRESH) {
        findings.push({
          id: uid(),
          severity: bestSim < 0.5 ? 'MAJOR' : 'MINOR',
          category: 'TEXT_MISMATCH',
          description: `${targetLabel} 문구 유사도 낮음 (${(bestSim*100).toFixed(0)}%): Spec="${s.text}" vs ${targetLabel}="${best?.text}"`,
          evidence: { spec: s, match: best }
        });
      }
    }
  };

  // Phase-based comparisons
  if (specDoc && figmaDoc) compareSpecTo(figmaDoc, 'Figma');
  if (phase >= 2 && specDoc && webDoc) compareSpecTo(webDoc, 'Web');
  if (phase >= 3 && specDoc && androidDoc) compareSpecTo(androidDoc, 'Android');
  if (phase >= 4 && specDoc && iosDoc) compareSpecTo(iosDoc, 'iOS');

  return findings;
}

// ----------------------------- UI -----------------------------

export default function DiffCheckerDashboard() {
  const [phase, setPhase] = useState<Phase>(1);
  const [specInputMode, setSpecInputMode] = useState<'text' | 'wiki' | 'file'>('text');
  const [specText, setSpecText] = useState<string>('성인 등급은 이용이 제한됩니다\n확인 버튼 노출');
  const [specWikiUrl, setSpecWikiUrl] = useState<string>('');
  const [specWikiRawText, setSpecWikiRawText] = useState<string>('');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [confluenceEmail, setConfluenceEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('confluence_email') || '';
    }
    return '';
  });
  const [confluenceToken, setConfluenceToken] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('confluence_token') || '';
    }
    return '';
  });
  const [confluenceBaseUrl, setConfluenceBaseUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('confluence_base_url') || '';
    }
    return '';
  });
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [figmaInputMode, setFigmaInputMode] = useState<'json' | 'file' | 'api'>('json');
  const [figmaUrl, setFigmaUrl] = useState<string>('');
  const [figmaToken, setFigmaToken] = useState<string>('');
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [figmaText, setFigmaText] = useState<string>('');
  const [figmaJson, setFigmaJson] = useState<any | null>(null);
  const [webText, setWebText] = useState<string>('');
  const [webJson, setWebJson] = useState<any | null>(null);
  const [androidText, setAndroidText] = useState<string>('');
  const [androidJson, setAndroidJson] = useState<any | null>(null);
  const [iosText, setIosText] = useState<string>('');
  const [iosJson, setIosJson] = useState<any | null>(null);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [running, setRunning] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>, setter: (v: any) => void) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result));
        setter(json);
      } catch (err) {
        alert('JSON 파싱 실패: ' + (err as Error).message);
      }
    };
    reader.readAsText(f);
  }

  const parseJSON = (s: string) => {
    if (!s.trim()) return undefined;
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const specDoc = useMemo(() => (specText ? specToDoc(specText) : undefined), [specText]);
  const figmaDoc = useMemo(() => {
    if (figmaInputMode === 'json' && figmaText) {
      const parsed = parseJSON(figmaText);
      return parsed ? figmaJsonToDoc(parsed) : undefined;
    }
    return figmaJson ? figmaJsonToDoc(figmaJson) : undefined;
  }, [figmaInputMode, figmaText, figmaJson]);
  const webDoc = useMemo(() => {
    const parsed = parseJSON(webText);
    return parsed ? webJsonToDoc(parsed) : (webJson ? webJsonToDoc(webJson) : undefined);
  }, [webText, webJson]);
  const androidDoc = useMemo(() => {
    const parsed = parseJSON(androidText);
    return parsed ? mobileJsonToDoc(parsed, 'ANDROID') : (androidJson ? mobileJsonToDoc(androidJson, 'ANDROID') : undefined);
  }, [androidText, androidJson]);
  const iosDoc = useMemo(() => {
    const parsed = parseJSON(iosText);
    return parsed ? mobileJsonToDoc(parsed, 'IOS') : (iosJson ? mobileJsonToDoc(iosJson, 'IOS') : undefined);
  }, [iosText, iosJson]);

  const summary = useMemo(() => {
    const by: Record<Severity, number> = { CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
    for (const f of findings) by[f.severity]++;
    return by;
  }, [findings]);

  function pasteSample(target: 'figma' | 'web' | 'android' | 'ios') {
    const figs = `{
  "type": "FRAME",
  "name": "UserGrade/Restriction",
  "visible": true,
  "children": [
    { "type": "TEXT", "name": "Title", "characters": "성인 작품은 노출되지 않습니다", "visible": true }
  ]
}`;
    const web = `{
  "elements": [
    { "role": "text", "id": "msg", "text": "허용된 등급 이상만 볼 수 있어요", "visible": true },
    { "role": "button", "id": "ok", "text": "확인", "visible": true }
  ]
}`;
    const andr = `{
  "nodes": [
    { "role": "text", "resourceId": "tvMessage", "text": "허용된 등급 이상만 볼 수 있어요", "visible": true },
    { "role": "image", "resourceId": "ivAdultBadge", "name": "adultIcon", "visible": true }
  ]
}`;
    const ios = `{
  "nodes": [
    { "role": "text", "name": "label.message", "text": "성인 등급은 이용이 제한됩니다", "visible": true },
    { "role": "button", "name": "btn.ok", "text": "확인", "visible": true }
  ]
}`;
    if (target === 'figma') setFigmaText(figs);
    if (target === 'web') setWebText(web);
    if (target === 'android') setAndroidText(andr);
    if (target === 'ios') setIosText(ios);
  }

  function onExportMarkdown() {
    let md = `# Phase ${phase} Diff Results\n\n`;
    md += `Generated at: ${new Date().toISOString()}\n\n`;
    md += `## Summary\n\n`;
    md += `- CRITICAL: ${summary.CRITICAL}\n`;
    md += `- MAJOR: ${summary.MAJOR}\n`;
    md += `- MINOR: ${summary.MINOR}\n`;
    md += `- INFO: ${summary.INFO}\n\n`;
    md += `## Findings\n\n`;
    findings.forEach((f, i) => {
      md += `### ${i + 1}. [${f.severity}] ${f.category}\n\n`;
      md += `${f.description}\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phase-${phase}-diff.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onExportJson() {
    const json = JSON.stringify(
      {
        phase,
        summary: {
          total: findings.length,
          bySeverity: summary,
        },
        findings,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phase-${phase}-diff.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onExportHtml() {
    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Phase ${phase} Diff Results</title>
  <style>
    body { font-family: sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .summary-card { padding: 15px; border-radius: 8px; border: 1px solid #ddd; }
    .critical { border-color: #dc2626; }
    .major { border-color: #ea580c; }
    .minor { border-color: #ca8a04; }
    .info { border-color: #6b7280; }
    .finding { margin: 20px 0; padding: 15px; border-left: 4px solid #ddd; }
    .finding.critical { border-color: #dc2626; }
    .finding.major { border-color: #ea580c; }
    .finding.minor { border-color: #ca8a04; }
    .finding.info { border-color: #6b7280; }
  </style>
</head>
<body>
  <h1>Phase ${phase} Diff Results</h1>
  <p>Generated at: ${new Date().toISOString()}</p>
  <div class="summary">
    <div class="summary-card critical">
      <strong>CRITICAL</strong><br>${summary.CRITICAL}
    </div>
    <div class="summary-card major">
      <strong>MAJOR</strong><br>${summary.MAJOR}
    </div>
    <div class="summary-card minor">
      <strong>MINOR</strong><br>${summary.MINOR}
    </div>
    <div class="summary-card info">
      <strong>INFO</strong><br>${summary.INFO}
    </div>
  </div>
  <h2>Findings</h2>`;
    findings.forEach((f) => {
      html += `
  <div class="finding ${f.severity.toLowerCase()}">
    <strong>[${f.severity}] ${f.category}</strong>
    <p>${f.description}</p>
  </div>`;
    });
    html += `
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phase-${phase}-diff.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = runDiff(phase, specDoc, figmaDoc, webDoc, androidDoc, iosDoc);
      setFindings(result);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ⚠️ UI PROTECTED: 헤더 영역 - 사용자 명시적 요청 없이 변경/삭제 금지 */}
      {/* 변경 시 반드시 사용자 확인 필요 */}
      {/* 마지막 검증: 2025-01-XX */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">Spec–Design–Implementation Diff Checker</h1>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Phase</label>
            <select
              value={phase}
              onChange={(e) => setPhase(Number(e.target.value) as Phase)}
              className="rounded-md border-gray-300 text-sm shadow-sm focus:ring-2 focus:ring-black/10"
            >
              <option value={1}>1: Spec ↔ Figma</option>
              <option value={2}>2: + Web</option>
              <option value={3}>3: + Android</option>
              <option value={4}>4: + iOS</option>
            </select>
            <button
              onClick={handleRun}
              disabled={running}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm shadow hover:bg-gray-900 disabled:opacity-50"
            >
              {running ? 'Running…' : 'Run Diff'}
            </button>
            {/* ⚠️ UI PROTECTED: Export 버튼들 - 사용자 명시적 요청 없이 변경/삭제 금지 */}
            <div className="flex gap-2">
              <button
                onClick={onExportMarkdown}
                disabled={findings.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={findings.length === 0 ? '결과가 없습니다' : 'Markdown 형식으로 내보내기'}
              >
                Export Markdown
              </button>
              <button
                onClick={onExportJson}
                disabled={findings.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={findings.length === 0 ? '결과가 없습니다' : 'JSON 형식으로 내보내기'}
              >
                Export JSON
              </button>
              <button
                onClick={onExportHtml}
                disabled={findings.length === 0}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed"
                title={findings.length === 0 ? '결과가 없습니다' : 'HTML 형식으로 내보내기'}
              >
                Export HTML
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ⚠️ UI PROTECTED: Input 영역 - 사용자 명시적 요청 없이 변경/삭제 금지 */}
        {/* 변경 시 반드시 사용자 확인 필요 */}
        {/* 마지막 검증: 2025-01-XX */}
        {/* Left: Inputs */}
        <section className="space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">① Inputs</h2>

            <div className="grid grid-cols-1 gap-4">
              {/* ⚠️ UI PROTECTED: Spec 입력 영역 - 사용자 명시적 요청 없이 변경/삭제 금지 */}
              {/* Spec */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Spec 입력 방식</label>
                </div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setSpecInputMode('text')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      specInputMode === 'text'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    텍스트 입력
                  </button>
                  <button
                    onClick={() => setSpecInputMode('wiki')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      specInputMode === 'wiki'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    위키 링크
                  </button>
                  <button
                    onClick={() => setSpecInputMode('file')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      specInputMode === 'file'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    PDF 업로드
                  </button>
                </div>
                {specInputMode === 'text' && (
                  <textarea
                    className="w-full min-h-[120px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                    value={specText}
                    onChange={(e) => setSpecText(e.target.value)}
                    placeholder="정책/문구를 한 줄씩 입력하세요"
                  />
                )}
                {specInputMode === 'wiki' && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2"
                        value={specWikiUrl}
                        onChange={(e) => setSpecWikiUrl(e.target.value)}
                        placeholder="위키 페이지 URL을 입력하세요"
                      />
                      <button
                        onClick={async () => {
                          if (!specWikiUrl.trim()) {
                            alert('위키 링크를 입력해주세요.');
                            return;
                          }
                          
                          // Confluence 인증 정보를 로컬 스토리지에 저장
                          if (typeof window !== 'undefined') {
                            if (confluenceEmail) localStorage.setItem('confluence_email', confluenceEmail);
                            if (confluenceToken) localStorage.setItem('confluence_token', confluenceToken);
                            if (confluenceBaseUrl) localStorage.setItem('confluence_base_url', confluenceBaseUrl);
                          }
                          
                          setSpecLoading(true);
                          try {
                            // Vite 프록시를 통해 Next.js 앱의 API 호출
                            const res = await fetch('/api/spec/fetch-wiki', {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({
                                url: specWikiUrl,
                                confluenceEmail: confluenceEmail || undefined,
                                confluenceToken: confluenceToken || undefined,
                                confluenceBaseUrl: confluenceBaseUrl || undefined,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) {
                              if (data.requiresAuth) {
                                alert(
                                  '인증이 필요한 위키입니다.\n\n' +
                                  'Confluence를 사용하는 경우:\n' +
                                  '1. Confluence API 토큰 발급 (설정 → 보안 → API 토큰)\n' +
                                  '2. 이메일, API 토큰 입력 (Base URL은 자동 추출됩니다)\n\n' +
                                  '또는 위키 내용을 직접 복사하여 "텍스트 입력" 탭에 붙여넣으세요.'
                                );
                              }
                              alert(`오류: ${data?.error || '위키 내용을 가져오는데 실패했습니다.'}`);
                              throw new Error(data?.error || '위키 내용을 가져오는데 실패했습니다.');
                            }
                            const rawText = data.text || '';
                            setSpecWikiRawText(rawText);
                            setSpecText(rawText);
                            setSelectedSections([]);
                            alert('위키 내용을 불러왔습니다. 필요시 아래에서 특정 섹션만 선택하거나 텍스트를 직접 편집할 수 있습니다.');
                          } catch (e: any) {
                            if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
                              alert('Next.js 앱이 실행 중이지 않습니다.\n\n위키/PDF 기능을 사용하려면 Next.js 앱도 함께 실행해야 합니다:\npnpm dev:next\n\n또는 텍스트 입력 모드에서 직접 붙여넣으세요.');
                            } else {
                              alert(e?.message ?? '위키 내용을 가져오는데 실패했습니다.');
                            }
                          } finally {
                            setSpecLoading(false);
                          }
                        }}
                        disabled={specLoading}
                        className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50"
                      >
                        {specLoading ? '불러오는 중...' : '가져오기'}
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-700">Confluence 인증 (선택사항)</p>
                        {(confluenceEmail || confluenceToken || confluenceBaseUrl) && (
                          <button
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                localStorage.removeItem('confluence_email');
                                localStorage.removeItem('confluence_token');
                                localStorage.removeItem('confluence_base_url');
                                setConfluenceEmail('');
                                setConfluenceToken('');
                                setConfluenceBaseUrl('');
                                alert('저장된 Confluence 인증 정보가 삭제되었습니다.');
                              }
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                            title="저장된 인증 정보 삭제"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="email"
                          className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5"
                          value={confluenceEmail}
                          onChange={(e) => {
                            setConfluenceEmail(e.target.value);
                            if (typeof window !== 'undefined' && e.target.value) {
                              localStorage.setItem('confluence_email', e.target.value);
                            }
                          }}
                          placeholder={confluenceEmail ? '이메일 저장됨' : '이메일'}
                        />
                        <input
                          type="password"
                          className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5"
                          value={confluenceToken}
                          onChange={(e) => {
                            setConfluenceToken(e.target.value);
                            if (typeof window !== 'undefined' && e.target.value) {
                              localStorage.setItem('confluence_token', e.target.value);
                            }
                          }}
                          placeholder={confluenceToken ? '토큰 저장됨' : 'API 토큰'}
                        />
                        <input
                          type="text"
                          className="rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5"
                          value={confluenceBaseUrl}
                          onChange={(e) => {
                            setConfluenceBaseUrl(e.target.value);
                            if (typeof window !== 'undefined' && e.target.value) {
                              localStorage.setItem('confluence_base_url', e.target.value);
                            }
                          }}
                          placeholder={confluenceBaseUrl ? 'Base URL 저장됨' : 'Base URL (예: https://your-domain.atlassian.net)'}
                        />
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>💡 인증이 필요한 위키는 Confluence 정보를 입력하세요. 공개 위키는 비워두세요.</p>
                        {(confluenceEmail || confluenceToken || confluenceBaseUrl) && (
                          <p className="text-green-600">✓ 인증 정보가 저장되었습니다. 새로고침해도 유지됩니다.</p>
                        )}
                      </div>
                    </div>
                    {specText && specWikiRawText && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">비교에 사용할 내용 (편집 가능):</label>
                          {specText !== specWikiRawText && (
                            <button
                              onClick={() => {
                                if (confirm('원본으로 복원하시겠습니까? 현재 편집 내용이 사라집니다.')) {
                                  setSpecText(specWikiRawText);
                                  setSelectedSections([]);
                                }
                              }}
                              className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                              원본 복원
                            </button>
                          )}
                        </div>
                        <textarea
                          className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                          value={specText}
                          onChange={(e) => setSpecText(e.target.value)}
                          placeholder="위키에서 가져온 내용이 여기에 표시됩니다. 필요시 직접 편집하여 불필요한 부분을 제거하세요."
                        />
                        <p className="text-xs text-gray-500">
                          💡 기획 배경, 성과 등 UI 비교와 무관한 내용은 제거하는 것을 권장합니다.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {specInputMode === 'file' && (
                  <div className="space-y-2">
                    <label className="block">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (!file.name.toLowerCase().endsWith('.pdf')) {
                              alert('PDF 파일만 업로드 가능합니다.');
                              return;
                            }
                            setSpecFile(file);
                            setSpecLoading(true);
                            try {
                              const formData = new FormData();
                              formData.append('file', file);
                              const res = await fetch('/api/spec/parse-pdf', {
                                method: 'POST',
                                body: formData,
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data?.error || 'PDF 파싱에 실패했습니다.');
                              setSpecText(data.text || '');
                              alert('PDF 내용을 불러왔습니다.');
                            } catch (e: any) {
                              if (e?.message?.includes('Failed to fetch') || e?.message?.includes('NetworkError')) {
                                alert('Next.js 앱이 실행 중이지 않습니다.\n\nNext.js 앱을 실행하려면:\npnpm dev:next\n\n또는 텍스트 입력 모드에서 직접 붙여넣으세요.');
                              } else {
                                alert(e?.message ?? 'PDF 파싱에 실패했습니다.');
                              }
                            } finally {
                              setSpecLoading(false);
                            }
                          }
                        }}
                        className="hidden"
                      />
                      <div className="w-full min-h-[120px] rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
                        {specLoading ? (
                          <span className="text-sm text-gray-500">PDF 파싱 중...</span>
                        ) : specFile ? (
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">{specFile.name}</p>
                            <p className="text-xs text-gray-500 mt-1">다른 파일을 선택하려면 클릭하세요</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">PDF 파일을 선택하세요</p>
                            <p className="text-xs text-gray-500 mt-1">또는 드래그 앤 드롭</p>
                          </div>
                        )}
                      </div>
                    </label>
                    {specText && specFile && (
                      <textarea
                        className="w-full min-h-[120px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                        value={specText}
                        onChange={(e) => setSpecText(e.target.value)}
                        readOnly
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ⚠️ UI PROTECTED: Figma 입력 영역 - 사용자 명시적 요청 없이 변경/삭제 금지 */}
              {/* Figma */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Figma 입력</label>
                  <button onClick={() => pasteSample('figma')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setFigmaInputMode('json')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      figmaInputMode === 'json'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    JSON 직접 붙여넣기 (권장)
                  </button>
                  <button
                    onClick={() => setFigmaInputMode('file')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      figmaInputMode === 'file'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    파일 업로드
                  </button>
                  <button
                    onClick={() => setFigmaInputMode('api')}
                    className={`px-3 py-1.5 text-xs rounded-md border ${
                      figmaInputMode === 'api'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    API로 가져오기
                  </button>
                </div>
                {figmaInputMode === 'json' ? (
                  <div className="space-y-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                      <p className="text-xs text-blue-800 font-medium mb-1">JSON 직접 붙여넣기 방법:</p>
                      <ol className="text-xs text-blue-700 list-decimal list-inside space-y-0.5">
                        <li>Figma에서 Plugins → "Export to JSON" 실행</li>
                        <li>추출된 JSON 복사</li>
                        <li>아래 텍스트 영역에 붙여넣기 (Cmd/Ctrl + V)</li>
                      </ol>
                      <p className="text-xs text-blue-600 mt-2">API 한도 없음 | 무제한 사용 가능</p>
                    </div>
                    <textarea
                      className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                      value={figmaText}
                      onChange={(e) => setFigmaText(e.target.value)}
                      placeholder='Figma JSON을 여기에 붙여넣으세요...

예시:
[
  {
    "Content": "필터"
  },
  {
    "Content": "정렬 선택"
  }
]

또는 표준 Figma API 형식:
{
  "document": {
    "type": "FRAME",
    "children": [...]
  }
}'
                    />
                    {figmaText && (
                      <p className="text-xs text-green-600">JSON이 입력되었습니다. Run Diff 버튼을 클릭하세요.</p>
                    )}
                  </div>
                ) : figmaInputMode === 'file' ? (
                  <div className="space-y-2">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                      <p className="text-xs text-blue-800 font-medium mb-1">JSON 파일 업로드 방법:</p>
                      <ol className="text-xs text-blue-700 list-decimal list-inside space-y-0.5">
                        <li>Figma에서 Plugins → "Export to JSON" 실행</li>
                        <li>JSON을 파일로 저장 (.json 확장자)</li>
                        <li>아래에서 파일 선택</li>
                      </ol>
                      <p className="text-xs text-blue-600 mt-2">API 한도 없음 | 무제한 사용 가능</p>
                    </div>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => onFile(e, setFigmaJson)}
                        className="hidden"
                        id="figma-file-input"
                      />
                      <label
                        htmlFor="figma-file-input"
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-sm text-gray-600">
                          JSON 파일을 선택하거나 드래그하여 업로드
                        </span>
                        <span className="text-xs text-gray-400">
                          .json 파일만 지원됩니다
                        </span>
                      </label>
                    </div>
                    {figmaJson && (
                      <div className="space-y-2">
                        <p className="text-xs text-green-600">파일이 로드되었습니다. 내용을 확인하거나 수정할 수 있습니다.</p>
                        <textarea
                          className="w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                          value={JSON.stringify(figmaJson, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setFigmaJson(parsed);
                            } catch (err) {
                              // 파싱 실패 시 무시
                            }
                          }}
                          placeholder="JSON 내용이 여기에 표시됩니다..."
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2"
                        value={figmaUrl}
                        onChange={(e) => setFigmaUrl(e.target.value)}
                        placeholder="Figma 파일 URL (https://www.figma.com/file/...)"
                      />
                      <input
                        type="password"
                        className="w-48 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2"
                        value={figmaToken}
                        onChange={(e) => setFigmaToken(e.target.value)}
                        placeholder="Personal Access Token"
                      />
                      <button
                        onClick={async () => {
                          if (!figmaUrl.trim()) {
                            alert('Figma 파일 URL을 입력해주세요.');
                            return;
                          }
                          if (!figmaToken.trim()) {
                            alert('Figma Personal Access Token을 입력해주세요.');
                            return;
                          }
                          setFigmaLoading(true);
                          try {
                            alert('웹 앱에서는 API 호출이 지원되지 않습니다. JSON 직접 붙여넣기 또는 파일 업로드를 사용하세요.');
                          } catch (e: any) {
                            alert(e?.message ?? 'Figma 파일을 가져오는데 실패했습니다.');
                          } finally {
                            setFigmaLoading(false);
                          }
                        }}
                        disabled={figmaLoading}
                        className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap"
                      >
                        {figmaLoading ? '가져오는 중...' : '가져오기'}
                      </button>
                    </div>
                    <textarea
                      className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono"
                      value={figmaText}
                      onChange={(e) => setFigmaText(e.target.value)}
                      placeholder='API로 가져온 JSON이 여기에 표시됩니다. 또는 직접 붙여넣을 수도 있습니다.'
                    />
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>
                        토큰 발급: <a href="https://www.figma.com/settings" target="_blank" rel="noopener noreferrer" className="underline">Figma Settings → Personal access tokens</a>
                      </p>
                      {figmaToken && (
                        <p className="text-green-600">✓ 토큰이 저장되었습니다. 새로고침해도 유지됩니다.</p>
                      )}
                      {!figmaToken && (
                        <p className="text-gray-400">💡 토큰을 입력하면 자동으로 저장됩니다. 서버에 환경 변수(FIGMA_TOKEN)가 설정되어 있으면 기본값으로 사용됩니다.</p>
                      )}
                      <p className="text-orange-600">⚠️ API 방식은 요청 한도 제한이 있을 수 있습니다. JSON 직접 붙여넣기를 권장합니다.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ⚠️ UI PROTECTED: Web 입력 영역 - textarea + 샘플 붙여넣기 버튼 필수 유지 */}
              {/* Web */}
              <div className={`${phase >= 2 ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium mb-1">Web DOM JSON (Paste) (Phase ≥ 2)</label>
                  <button onClick={() => pasteSample('web')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                  value={webText}
                  onChange={(e) => setWebText(e.target.value)}
                />
              </div>

              {/* ⚠️ UI PROTECTED: Android 입력 영역 - textarea + 샘플 붙여넣기 버튼 필수 유지 */}
              {/* Android */}
              <div className={`${phase >= 3 ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium mb-1">Android Dump JSON (Paste) (Phase ≥ 3)</label>
                  <button onClick={() => pasteSample('android')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                  value={androidText}
                  onChange={(e) => setAndroidText(e.target.value)}
                />
              </div>

              {/* ⚠️ UI PROTECTED: iOS 입력 영역 - textarea + 샘플 붙여넣기 버튼 필수 유지 */}
              {/* iOS */}
              <div className={`${phase >= 4 ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium mb-1">iOS Dump JSON (Paste) (Phase ≥ 4)</label>
                  <button onClick={() => pasteSample('ios')} className="text-xs underline text-gray-600">샘플 붙여넣기</button>
                </div>
                <textarea
                  className="w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm"
                  value={iosText}
                  onChange={(e) => setIosText(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h3 className="font-semibold mb-2">가이드</h3>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
              <li>Spec은 정책/문구 한 줄씩 입력하면 자동 비교합니다.</li>
              <li>Figma는 REST JSON 또는 Export JSON을 업로드하면 됩니다.</li>
              <li>Web/Android/iOS JSON은 PoC 단계에서는 수동 업로드로 시작하세요.</li>
              <li>운영 전환 시, 업로드 대신 URL/Device 자동 수집으로 교체 가능합니다.</li>
            </ul>
          </div>
        </section>

        {/* Right: Results */}
        <section className="space-y-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">② Summary</h2>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-gray-500">CRITICAL</div>
                <div className="text-xl font-semibold text-red-600">{summary.CRITICAL}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-gray-500">MAJOR</div>
                <div className="text-xl font-semibold text-orange-600">{summary.MAJOR}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-gray-500">MINOR</div>
                <div className="text-xl font-semibold text-yellow-600">{summary.MINOR}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-gray-500">INFO</div>
                <div className="text-xl font-semibold text-gray-800">{summary.INFO}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 overflow-hidden">
            <h2 className="font-semibold mb-3">③ Findings</h2>
            {findings.length === 0 ? (
              <p className="text-sm text-gray-500">결과가 없습니다. 입력을 준비하고 Run Diff를 눌러주세요.</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600">
                      <th className="text-left p-2">Severity</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map((f) => (
                      <tr key={f.id} className="border-t">
                        <td className="p-2 font-medium">
                          <span className={
                            f.severity === 'CRITICAL' ? 'text-red-600' :
                            f.severity === 'MAJOR' ? 'text-orange-600' :
                            f.severity === 'MINOR' ? 'text-yellow-600' : 'text-gray-700'
                          }>
                            {f.severity}
                          </span>
                        </td>
                        <td className="p-2 text-gray-700">{f.category}</td>
                        <td className="p-2 text-gray-800">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">④ Next</h2>
            <ol className="text-sm text-gray-600 list-decimal pl-5 space-y-1">
              <li>지금은 서버에서 간단 유사도로 판정합니다.</li>
              <li>Phase 3/4에서 업로드/자동수집(API 연동)로 확장하세요.</li>
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}




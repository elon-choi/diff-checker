import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
// ----------------------------- Utility -----------------------------
function uid() {
    return Math.random().toString(36).slice(2, 10);
}
function normalizeText(s) {
    if (!s)
        return '';
    return s
        .replace(/\s+/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .toLowerCase();
}
function similarity(a, b) {
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
function specToDoc(specText) {
    const lines = specText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    const nodes = lines.map((line, i) => ({
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
function figmaJsonToDoc(figma) {
    const nodes = [];
    function walk(node, path = []) {
        if (!node || typeof node !== 'object')
            return;
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
            node.children.forEach((c) => walk(c, thisPath));
        }
        if (Array.isArray(node))
            node.forEach((c) => walk(c, path));
    }
    walk(figma, []);
    return { platform: 'FIGMA', nodes };
}
/** WEB normalizer (demo)
 * Accepts a JSON with array of visible elements: { text, role, id, className }
 * Real-world: capture via Playwright script → DOM JSON.
 */
function webJsonToDoc(web) {
    const nodes = [];
    const list = Array.isArray(web?.elements) ? web.elements : [];
    for (const el of list) {
        if (!el?.text)
            continue;
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
function mobileJsonToDoc(anyJson, platform) {
    const nodes = [];
    const list = Array.isArray(anyJson?.nodes) ? anyJson.nodes : [];
    for (const n of list) {
        if (!n?.text && !n?.name)
            continue;
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
function runDiff(phase, specDoc, figmaDoc, webDoc, androidDoc, iosDoc) {
    const findings = [];
    const THRESH = 0.9; // text similarity threshold
    const compareSpecTo = (target, targetLabel) => {
        if (!specDoc || !target)
            return;
        for (const s of specDoc.nodes) {
            if (!s.text)
                continue;
            const sNorm = normalizeText(s.text);
            // Try exact & similar match among target nodes
            let best = null;
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
                    description: `${targetLabel} 문구 유사도 낮음 (${(bestSim * 100).toFixed(0)}%): Spec="${s.text}" vs ${targetLabel}="${best?.text}"`,
                    evidence: { spec: s, match: best }
                });
            }
        }
    };
    // Phase-based comparisons
    if (specDoc && figmaDoc)
        compareSpecTo(figmaDoc, 'Figma');
    if (phase >= 2 && specDoc && webDoc)
        compareSpecTo(webDoc, 'Web');
    if (phase >= 3 && specDoc && androidDoc)
        compareSpecTo(androidDoc, 'Android');
    if (phase >= 4 && specDoc && iosDoc)
        compareSpecTo(iosDoc, 'iOS');
    return findings;
}
// ----------------------------- UI -----------------------------
export default function DiffCheckerDashboard() {
    const [phase, setPhase] = useState(1);
    const [specInputMode, setSpecInputMode] = useState('text');
    const [specText, setSpecText] = useState('성인 등급은 이용이 제한됩니다\n확인 버튼 노출');
    const [specWikiUrl, setSpecWikiUrl] = useState('');
    const [specWikiRawText, setSpecWikiRawText] = useState('');
    const [selectedSections, setSelectedSections] = useState([]);
    const [confluenceEmail, setConfluenceEmail] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('confluence_email') || '';
        }
        return '';
    });
    const [confluenceToken, setConfluenceToken] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('confluence_token') || '';
        }
        return '';
    });
    const [confluenceBaseUrl, setConfluenceBaseUrl] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('confluence_base_url') || '';
        }
        return '';
    });
    const [specFile, setSpecFile] = useState(null);
    const [specLoading, setSpecLoading] = useState(false);
    const [figmaInputMode, setFigmaInputMode] = useState('json');
    const [figmaUrl, setFigmaUrl] = useState('');
    const [figmaToken, setFigmaToken] = useState('');
    const [figmaLoading, setFigmaLoading] = useState(false);
    const [figmaText, setFigmaText] = useState('');
    const [figmaJson, setFigmaJson] = useState(null);
    const [webText, setWebText] = useState('');
    const [webJson, setWebJson] = useState(null);
    const [androidText, setAndroidText] = useState('');
    const [androidJson, setAndroidJson] = useState(null);
    const [iosText, setIosText] = useState('');
    const [iosJson, setIosJson] = useState(null);
    const [findings, setFindings] = useState([]);
    const [running, setRunning] = useState(false);
    function onFile(e, setter) {
        const f = e.target.files?.[0];
        if (!f)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = JSON.parse(String(reader.result));
                setter(json);
            }
            catch (err) {
                alert('JSON 파싱 실패: ' + err.message);
            }
        };
        reader.readAsText(f);
    }
    const parseJSON = (s) => {
        if (!s.trim())
            return undefined;
        try {
            return JSON.parse(s);
        }
        catch {
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
        const by = { CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
        for (const f of findings)
            by[f.severity]++;
        return by;
    }, [findings]);
    function pasteSample(target) {
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
        if (target === 'figma')
            setFigmaText(figs);
        if (target === 'web')
            setWebText(web);
        if (target === 'android')
            setAndroidText(andr);
        if (target === 'ios')
            setIosText(ios);
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
        const json = JSON.stringify({
            phase,
            summary: {
                total: findings.length,
                bySeverity: summary,
            },
            findings,
            generatedAt: new Date().toISOString(),
        }, null, 2);
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
        }
        finally {
            setRunning(false);
        }
    };
    return (_jsxs("div", { className: "min-h-screen bg-gray-50", children: [_jsx("header", { className: "sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200", children: _jsxs("div", { className: "mx-auto max-w-7xl px-4 py-3 flex items-center justify-between", children: [_jsx("h1", { className: "text-xl font-semibold tracking-tight", children: "Spec\u2013Design\u2013Implementation Diff Checker" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("label", { className: "text-sm text-gray-600", children: "Phase" }), _jsxs("select", { value: phase, onChange: (e) => setPhase(Number(e.target.value)), className: "rounded-md border-gray-300 text-sm shadow-sm focus:ring-2 focus:ring-black/10", children: [_jsx("option", { value: 1, children: "1: Spec \u2194 Figma" }), _jsx("option", { value: 2, children: "2: + Web" }), _jsx("option", { value: 3, children: "3: + Android" }), _jsx("option", { value: 4, children: "4: + iOS" })] }), _jsx("button", { onClick: handleRun, disabled: running, className: "rounded-lg bg-black text-white px-4 py-2 text-sm shadow hover:bg-gray-900 disabled:opacity-50", children: running ? 'Running…' : 'Run Diff' }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: onExportMarkdown, disabled: findings.length === 0, className: "rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed", title: findings.length === 0 ? '결과가 없습니다' : 'Markdown 형식으로 내보내기', children: "Export Markdown" }), _jsx("button", { onClick: onExportJson, disabled: findings.length === 0, className: "rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed", title: findings.length === 0 ? '결과가 없습니다' : 'JSON 형식으로 내보내기', children: "Export JSON" }), _jsx("button", { onClick: onExportHtml, disabled: findings.length === 0, className: "rounded-lg border border-gray-300 px-3 py-2 text-sm shadow disabled:opacity-50 disabled:cursor-not-allowed", title: findings.length === 0 ? '결과가 없습니다' : 'HTML 형식으로 내보내기', children: "Export HTML" })] })] })] }) }), _jsxs("main", { className: "mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs("section", { className: "space-y-4", children: [_jsxs("div", { className: "bg-white rounded-2xl shadow p-4", children: [_jsx("h2", { className: "font-semibold mb-2", children: "\u2460 Inputs" }), _jsxs("div", { className: "grid grid-cols-1 gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "flex items-center justify-between mb-2", children: _jsx("label", { className: "block text-sm font-medium", children: "Spec \uC785\uB825 \uBC29\uC2DD" }) }), _jsxs("div", { className: "flex gap-2 mb-3", children: [_jsx("button", { onClick: () => setSpecInputMode('text'), className: `px-3 py-1.5 text-xs rounded-md border ${specInputMode === 'text'
                                                                    ? 'bg-black text-white border-black'
                                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`, children: "\uD14D\uC2A4\uD2B8 \uC785\uB825" }), _jsx("button", { onClick: () => setSpecInputMode('wiki'), className: `px-3 py-1.5 text-xs rounded-md border ${specInputMode === 'wiki'
                                                                    ? 'bg-black text-white border-black'
                                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`, children: "\uC704\uD0A4 \uB9C1\uD06C" }), _jsx("button", { onClick: () => setSpecInputMode('file'), className: `px-3 py-1.5 text-xs rounded-md border ${specInputMode === 'file'
                                                                    ? 'bg-black text-white border-black'
                                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`, children: "PDF \uC5C5\uB85C\uB4DC" })] }), specInputMode === 'text' && (_jsx("textarea", { className: "w-full min-h-[120px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm", value: specText, onChange: (e) => setSpecText(e.target.value), placeholder: "\uC815\uCC45/\uBB38\uAD6C\uB97C \uD55C \uC904\uC529 \uC785\uB825\uD558\uC138\uC694" })), specInputMode === 'wiki' && (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", className: "flex-1 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2", value: specWikiUrl, onChange: (e) => setSpecWikiUrl(e.target.value), placeholder: "\uC704\uD0A4 \uD398\uC774\uC9C0 URL\uC744 \uC785\uB825\uD558\uC138\uC694" }), _jsx("button", { onClick: async () => {
                                                                            if (!specWikiUrl.trim()) {
                                                                                alert('위키 링크를 입력해주세요.');
                                                                                return;
                                                                            }
                                                                            setSpecLoading(true);
                                                                            try {
                                                                                alert('웹 앱에서는 위키 API 호출이 지원되지 않습니다. Next.js 앱을 사용하거나 텍스트 입력 모드에서 직접 붙여넣으세요.');
                                                                            }
                                                                            catch (e) {
                                                                                alert(e?.message ?? '위키 내용을 가져오는데 실패했습니다.');
                                                                            }
                                                                            finally {
                                                                                setSpecLoading(false);
                                                                            }
                                                                        }, disabled: specLoading, className: "px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50", children: specLoading ? '불러오는 중...' : '가져오기' })] }), _jsxs("div", { className: "bg-gray-50 rounded-lg p-3 space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-xs font-medium text-gray-700", children: "Confluence \uC778\uC99D (\uC120\uD0DD\uC0AC\uD56D)" }), (confluenceEmail || confluenceToken || confluenceBaseUrl) && (_jsx("button", { onClick: () => {
                                                                                    if (typeof window !== 'undefined') {
                                                                                        localStorage.removeItem('confluence_email');
                                                                                        localStorage.removeItem('confluence_token');
                                                                                        localStorage.removeItem('confluence_base_url');
                                                                                        setConfluenceEmail('');
                                                                                        setConfluenceToken('');
                                                                                        setConfluenceBaseUrl('');
                                                                                        alert('저장된 Confluence 인증 정보가 삭제되었습니다.');
                                                                                    }
                                                                                }, className: "text-xs text-gray-500 hover:text-gray-700 underline", title: "\uC800\uC7A5\uB41C \uC778\uC99D \uC815\uBCF4 \uC0AD\uC81C", children: "\uC0AD\uC81C" }))] }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx("input", { type: "email", className: "rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5", value: confluenceEmail, onChange: (e) => {
                                                                                    setConfluenceEmail(e.target.value);
                                                                                    if (typeof window !== 'undefined' && e.target.value) {
                                                                                        localStorage.setItem('confluence_email', e.target.value);
                                                                                    }
                                                                                }, placeholder: confluenceEmail ? '이메일 저장됨' : '이메일' }), _jsx("input", { type: "password", className: "rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5", value: confluenceToken, onChange: (e) => {
                                                                                    setConfluenceToken(e.target.value);
                                                                                    if (typeof window !== 'undefined' && e.target.value) {
                                                                                        localStorage.setItem('confluence_token', e.target.value);
                                                                                    }
                                                                                }, placeholder: confluenceToken ? '토큰 저장됨' : 'API 토큰' }), _jsx("input", { type: "text", className: "rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-xs px-2 py-1.5", value: confluenceBaseUrl, onChange: (e) => {
                                                                                    setConfluenceBaseUrl(e.target.value);
                                                                                    if (typeof window !== 'undefined' && e.target.value) {
                                                                                        localStorage.setItem('confluence_base_url', e.target.value);
                                                                                    }
                                                                                }, placeholder: confluenceBaseUrl ? 'Base URL 저장됨' : 'Base URL (예: https://your-domain.atlassian.net)' })] }), _jsxs("div", { className: "text-xs text-gray-500 space-y-1", children: [_jsx("p", { children: "\uD83D\uDCA1 \uC778\uC99D\uC774 \uD544\uC694\uD55C \uC704\uD0A4\uB294 Confluence \uC815\uBCF4\uB97C \uC785\uB825\uD558\uC138\uC694. \uACF5\uAC1C \uC704\uD0A4\uB294 \uBE44\uC6CC\uB450\uC138\uC694." }), (confluenceEmail || confluenceToken || confluenceBaseUrl) && (_jsx("p", { className: "text-green-600", children: "\u2713 \uC778\uC99D \uC815\uBCF4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68\uD574\uB3C4 \uC720\uC9C0\uB429\uB2C8\uB2E4." }))] })] }), specText && specWikiRawText && (_jsxs("div", { className: "space-y-1", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("label", { className: "text-xs font-medium text-gray-700", children: "\uBE44\uAD50\uC5D0 \uC0AC\uC6A9\uD560 \uB0B4\uC6A9 (\uD3B8\uC9D1 \uAC00\uB2A5):" }), specText !== specWikiRawText && (_jsx("button", { onClick: () => {
                                                                                    if (confirm('원본으로 복원하시겠습니까? 현재 편집 내용이 사라집니다.')) {
                                                                                        setSpecText(specWikiRawText);
                                                                                        setSelectedSections([]);
                                                                                    }
                                                                                }, className: "text-xs text-gray-500 hover:text-gray-700 underline", children: "\uC6D0\uBCF8 \uBCF5\uC6D0" }))] }), _jsx("textarea", { className: "w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono", value: specText, onChange: (e) => setSpecText(e.target.value), placeholder: "\uC704\uD0A4\uC5D0\uC11C \uAC00\uC838\uC628 \uB0B4\uC6A9\uC774 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4. \uD544\uC694\uC2DC \uC9C1\uC811 \uD3B8\uC9D1\uD558\uC5EC \uBD88\uD544\uC694\uD55C \uBD80\uBD84\uC744 \uC81C\uAC70\uD558\uC138\uC694." }), _jsx("p", { className: "text-xs text-gray-500", children: "\uD83D\uDCA1 \uAE30\uD68D \uBC30\uACBD, \uC131\uACFC \uB4F1 UI \uBE44\uAD50\uC640 \uBB34\uAD00\uD55C \uB0B4\uC6A9\uC740 \uC81C\uAC70\uD558\uB294 \uAC83\uC744 \uAD8C\uC7A5\uD569\uB2C8\uB2E4." })] }))] })), specInputMode === 'file' && (_jsxs("div", { className: "space-y-2", children: [_jsxs("label", { className: "block", children: [_jsx("input", { type: "file", accept: ".pdf", onChange: (e) => {
                                                                            const file = e.target.files?.[0];
                                                                            if (file) {
                                                                                setSpecFile(file);
                                                                                setSpecLoading(true);
                                                                                setTimeout(() => {
                                                                                    alert('웹 앱에서는 PDF 파싱이 지원되지 않습니다. Next.js 앱을 사용하거나 텍스트 입력 모드에서 직접 붙여넣으세요.');
                                                                                    setSpecLoading(false);
                                                                                }, 500);
                                                                            }
                                                                        }, className: "hidden" }), _jsx("div", { className: "w-full min-h-[120px] rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors", children: specLoading ? (_jsx("span", { className: "text-sm text-gray-500", children: "PDF \uD30C\uC2F1 \uC911..." })) : specFile ? (_jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-sm font-medium text-gray-700", children: specFile.name }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: "\uB2E4\uB978 \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uB824\uBA74 \uD074\uB9AD\uD558\uC138\uC694" })] })) : (_jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-sm font-medium text-gray-700", children: "PDF \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uC138\uC694" }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: "\uB610\uB294 \uB4DC\uB798\uADF8 \uC564 \uB4DC\uB86D" })] })) })] }), specText && specFile && (_jsx("textarea", { className: "w-full min-h-[120px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm", value: specText, onChange: (e) => setSpecText(e.target.value), readOnly: true }))] }))] }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("label", { className: "block text-sm font-medium", children: "Figma \uC785\uB825" }), _jsx("button", { onClick: () => pasteSample('figma'), className: "text-xs underline text-gray-600", children: "\uC0D8\uD50C \uBD99\uC5EC\uB123\uAE30" })] }), _jsxs("div", { className: "flex gap-2 mb-3", children: [_jsx("button", { onClick: () => setFigmaInputMode('json'), className: `px-3 py-1.5 text-xs rounded-md border ${figmaInputMode === 'json'
                                                                    ? 'bg-black text-white border-black'
                                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`, children: "JSON \uC9C1\uC811 \uBD99\uC5EC\uB123\uAE30 (\uAD8C\uC7A5)" }), _jsx("button", { onClick: () => setFigmaInputMode('file'), className: `px-3 py-1.5 text-xs rounded-md border ${figmaInputMode === 'file'
                                                                    ? 'bg-black text-white border-black'
                                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`, children: "\uD30C\uC77C \uC5C5\uB85C\uB4DC" }), _jsx("button", { onClick: () => setFigmaInputMode('api'), className: `px-3 py-1.5 text-xs rounded-md border ${figmaInputMode === 'api'
                                                                    ? 'bg-black text-white border-black'
                                                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`, children: "API\uB85C \uAC00\uC838\uC624\uAE30" })] }), figmaInputMode === 'json' ? (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2", children: [_jsx("p", { className: "text-xs text-blue-800 font-medium mb-1", children: "JSON \uC9C1\uC811 \uBD99\uC5EC\uB123\uAE30 \uBC29\uBC95:" }), _jsxs("ol", { className: "text-xs text-blue-700 list-decimal list-inside space-y-0.5", children: [_jsx("li", { children: "Figma\uC5D0\uC11C Plugins \u2192 \"Export to JSON\" \uC2E4\uD589" }), _jsx("li", { children: "\uCD94\uCD9C\uB41C JSON \uBCF5\uC0AC" }), _jsx("li", { children: "\uC544\uB798 \uD14D\uC2A4\uD2B8 \uC601\uC5ED\uC5D0 \uBD99\uC5EC\uB123\uAE30 (Cmd/Ctrl + V)" })] }), _jsx("p", { className: "text-xs text-blue-600 mt-2", children: "API \uD55C\uB3C4 \uC5C6\uC74C | \uBB34\uC81C\uD55C \uC0AC\uC6A9 \uAC00\uB2A5" })] }), _jsx("textarea", { className: "w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono", value: figmaText, onChange: (e) => setFigmaText(e.target.value), placeholder: 'Figma JSON\uC744 \uC5EC\uAE30\uC5D0 \uBD99\uC5EC\uB123\uC73C\uC138\uC694...\n\n\uC608\uC2DC:\n[\n  {\n    "Content": "\uD544\uD130"\n  },\n  {\n    "Content": "\uC815\uB82C \uC120\uD0DD"\n  }\n]\n\n\uB610\uB294 \uD45C\uC900 Figma API \uD615\uC2DD:\n{\n  "document": {\n    "type": "FRAME",\n    "children": [...]\n  }\n}' }), figmaText && (_jsx("p", { className: "text-xs text-green-600", children: "JSON\uC774 \uC785\uB825\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Run Diff \uBC84\uD2BC\uC744 \uD074\uB9AD\uD558\uC138\uC694." }))] })) : figmaInputMode === 'file' ? (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2", children: [_jsx("p", { className: "text-xs text-blue-800 font-medium mb-1", children: "JSON \uD30C\uC77C \uC5C5\uB85C\uB4DC \uBC29\uBC95:" }), _jsxs("ol", { className: "text-xs text-blue-700 list-decimal list-inside space-y-0.5", children: [_jsx("li", { children: "Figma\uC5D0\uC11C Plugins \u2192 \"Export to JSON\" \uC2E4\uD589" }), _jsx("li", { children: "JSON\uC744 \uD30C\uC77C\uB85C \uC800\uC7A5 (.json \uD655\uC7A5\uC790)" }), _jsx("li", { children: "\uC544\uB798\uC5D0\uC11C \uD30C\uC77C \uC120\uD0DD" })] }), _jsx("p", { className: "text-xs text-blue-600 mt-2", children: "API \uD55C\uB3C4 \uC5C6\uC74C | \uBB34\uC81C\uD55C \uC0AC\uC6A9 \uAC00\uB2A5" })] }), _jsxs("div", { className: "border-2 border-dashed border-gray-300 rounded-lg p-6 text-center", children: [_jsx("input", { type: "file", accept: ".json,application/json", onChange: (e) => onFile(e, setFigmaJson), className: "hidden", id: "figma-file-input" }), _jsxs("label", { htmlFor: "figma-file-input", className: "cursor-pointer flex flex-col items-center gap-2", children: [_jsx("svg", { className: "w-12 h-12 text-gray-400", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" }) }), _jsx("span", { className: "text-sm text-gray-600", children: "JSON \uD30C\uC77C\uC744 \uC120\uD0DD\uD558\uAC70\uB098 \uB4DC\uB798\uADF8\uD558\uC5EC \uC5C5\uB85C\uB4DC" }), _jsx("span", { className: "text-xs text-gray-400", children: ".json \uD30C\uC77C\uB9CC \uC9C0\uC6D0\uB429\uB2C8\uB2E4" })] })] }), figmaJson && (_jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-xs text-green-600", children: "\uD30C\uC77C\uC774 \uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB0B4\uC6A9\uC744 \uD655\uC778\uD558\uAC70\uB098 \uC218\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." }), _jsx("textarea", { className: "w-full min-h-[200px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono", value: JSON.stringify(figmaJson, null, 2), onChange: (e) => {
                                                                            try {
                                                                                const parsed = JSON.parse(e.target.value);
                                                                                setFigmaJson(parsed);
                                                                            }
                                                                            catch (err) {
                                                                                // 파싱 실패 시 무시
                                                                            }
                                                                        }, placeholder: "JSON \uB0B4\uC6A9\uC774 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4..." })] }))] })) : (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", className: "flex-1 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2", value: figmaUrl, onChange: (e) => setFigmaUrl(e.target.value), placeholder: "Figma \uD30C\uC77C URL (https://www.figma.com/file/...)" }), _jsx("input", { type: "password", className: "w-48 rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm px-3 py-2", value: figmaToken, onChange: (e) => setFigmaToken(e.target.value), placeholder: "Personal Access Token" }), _jsx("button", { onClick: async () => {
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
                                                                            }
                                                                            catch (e) {
                                                                                alert(e?.message ?? 'Figma 파일을 가져오는데 실패했습니다.');
                                                                            }
                                                                            finally {
                                                                                setFigmaLoading(false);
                                                                            }
                                                                        }, disabled: figmaLoading, className: "px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50 whitespace-nowrap", children: figmaLoading ? '가져오는 중...' : '가져오기' })] }), _jsx("textarea", { className: "w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm font-mono", value: figmaText, onChange: (e) => setFigmaText(e.target.value), placeholder: 'API\uB85C \uAC00\uC838\uC628 JSON\uC774 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4. \uB610\uB294 \uC9C1\uC811 \uBD99\uC5EC\uB123\uC744 \uC218\uB3C4 \uC788\uC2B5\uB2C8\uB2E4.' }), _jsxs("div", { className: "text-xs text-gray-500 space-y-1", children: [_jsxs("p", { children: ["\uD1A0\uD070 \uBC1C\uAE09: ", _jsx("a", { href: "https://www.figma.com/settings", target: "_blank", rel: "noopener noreferrer", className: "underline", children: "Figma Settings \u2192 Personal access tokens" })] }), figmaToken && (_jsx("p", { className: "text-green-600", children: "\u2713 \uD1A0\uD070\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68\uD574\uB3C4 \uC720\uC9C0\uB429\uB2C8\uB2E4." })), !figmaToken && (_jsx("p", { className: "text-gray-400", children: "\uD83D\uDCA1 \uD1A0\uD070\uC744 \uC785\uB825\uD558\uBA74 \uC790\uB3D9\uC73C\uB85C \uC800\uC7A5\uB429\uB2C8\uB2E4. \uC11C\uBC84\uC5D0 \uD658\uACBD \uBCC0\uC218(FIGMA_TOKEN)\uAC00 \uC124\uC815\uB418\uC5B4 \uC788\uC73C\uBA74 \uAE30\uBCF8\uAC12\uC73C\uB85C \uC0AC\uC6A9\uB429\uB2C8\uB2E4." })), _jsx("p", { className: "text-orange-600", children: "\u26A0\uFE0F API \uBC29\uC2DD\uC740 \uC694\uCCAD \uD55C\uB3C4 \uC81C\uD55C\uC774 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4. JSON \uC9C1\uC811 \uBD99\uC5EC\uB123\uAE30\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4." })] })] }))] }), _jsxs("div", { className: `${phase >= 2 ? '' : 'opacity-40 pointer-events-none'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("label", { className: "block text-sm font-medium mb-1", children: "Web DOM JSON (Paste) (Phase \u2265 2)" }), _jsx("button", { onClick: () => pasteSample('web'), className: "text-xs underline text-gray-600", children: "\uC0D8\uD50C \uBD99\uC5EC\uB123\uAE30" })] }), _jsx("textarea", { className: "w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm", value: webText, onChange: (e) => setWebText(e.target.value) })] }), _jsxs("div", { className: `${phase >= 3 ? '' : 'opacity-40 pointer-events-none'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("label", { className: "block text-sm font-medium mb-1", children: "Android Dump JSON (Paste) (Phase \u2265 3)" }), _jsx("button", { onClick: () => pasteSample('android'), className: "text-xs underline text-gray-600", children: "\uC0D8\uD50C \uBD99\uC5EC\uB123\uAE30" })] }), _jsx("textarea", { className: "w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm", value: androidText, onChange: (e) => setAndroidText(e.target.value) })] }), _jsxs("div", { className: `${phase >= 4 ? '' : 'opacity-40 pointer-events-none'}`, children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("label", { className: "block text-sm font-medium mb-1", children: "iOS Dump JSON (Paste) (Phase \u2265 4)" }), _jsx("button", { onClick: () => pasteSample('ios'), className: "text-xs underline text-gray-600", children: "\uC0D8\uD50C \uBD99\uC5EC\uB123\uAE30" })] }), _jsx("textarea", { className: "w-full min-h-[100px] rounded-lg border-gray-300 shadow-sm focus:ring-2 focus:ring-black/10 text-sm", value: iosText, onChange: (e) => setIosText(e.target.value) })] })] })] }), _jsxs("div", { className: "bg-white rounded-2xl shadow p-4", children: [_jsx("h3", { className: "font-semibold mb-2", children: "\uAC00\uC774\uB4DC" }), _jsxs("ul", { className: "text-sm text-gray-600 list-disc pl-5 space-y-1", children: [_jsx("li", { children: "Spec\uC740 \uC815\uCC45/\uBB38\uAD6C \uD55C \uC904\uC529 \uC785\uB825\uD558\uBA74 \uC790\uB3D9 \uBE44\uAD50\uD569\uB2C8\uB2E4." }), _jsx("li", { children: "Figma\uB294 REST JSON \uB610\uB294 Export JSON\uC744 \uC5C5\uB85C\uB4DC\uD558\uBA74 \uB429\uB2C8\uB2E4." }), _jsx("li", { children: "Web/Android/iOS JSON\uC740 PoC \uB2E8\uACC4\uC5D0\uC11C\uB294 \uC218\uB3D9 \uC5C5\uB85C\uB4DC\uB85C \uC2DC\uC791\uD558\uC138\uC694." }), _jsx("li", { children: "\uC6B4\uC601 \uC804\uD658 \uC2DC, \uC5C5\uB85C\uB4DC \uB300\uC2E0 URL/Device \uC790\uB3D9 \uC218\uC9D1\uC73C\uB85C \uAD50\uCCB4 \uAC00\uB2A5\uD569\uB2C8\uB2E4." })] })] })] }), _jsxs("section", { className: "space-y-4", children: [_jsxs("div", { className: "bg-white rounded-2xl shadow p-4", children: [_jsx("h2", { className: "font-semibold mb-2", children: "\u2461 Summary" }), _jsxs("div", { className: "grid grid-cols-4 gap-3 text-center", children: [_jsxs("div", { className: "rounded-xl border p-3", children: [_jsx("div", { className: "text-xs text-gray-500", children: "CRITICAL" }), _jsx("div", { className: "text-xl font-semibold text-red-600", children: summary.CRITICAL })] }), _jsxs("div", { className: "rounded-xl border p-3", children: [_jsx("div", { className: "text-xs text-gray-500", children: "MAJOR" }), _jsx("div", { className: "text-xl font-semibold text-orange-600", children: summary.MAJOR })] }), _jsxs("div", { className: "rounded-xl border p-3", children: [_jsx("div", { className: "text-xs text-gray-500", children: "MINOR" }), _jsx("div", { className: "text-xl font-semibold text-yellow-600", children: summary.MINOR })] }), _jsxs("div", { className: "rounded-xl border p-3", children: [_jsx("div", { className: "text-xs text-gray-500", children: "INFO" }), _jsx("div", { className: "text-xl font-semibold text-gray-800", children: summary.INFO })] })] })] }), _jsxs("div", { className: "bg-white rounded-2xl shadow p-4 overflow-hidden", children: [_jsx("h2", { className: "font-semibold mb-3", children: "\u2462 Findings" }), findings.length === 0 ? (_jsx("p", { className: "text-sm text-gray-500", children: "\uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC785\uB825\uC744 \uC900\uBE44\uD558\uACE0 Run Diff\uB97C \uB20C\uB7EC\uC8FC\uC138\uC694." })) : (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100 text-gray-600", children: [_jsx("th", { className: "text-left p-2", children: "Severity" }), _jsx("th", { className: "text-left p-2", children: "Category" }), _jsx("th", { className: "text-left p-2", children: "Description" })] }) }), _jsx("tbody", { children: findings.map((f) => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "p-2 font-medium", children: _jsx("span", { className: f.severity === 'CRITICAL' ? 'text-red-600' :
                                                                        f.severity === 'MAJOR' ? 'text-orange-600' :
                                                                            f.severity === 'MINOR' ? 'text-yellow-600' : 'text-gray-700', children: f.severity }) }), _jsx("td", { className: "p-2 text-gray-700", children: f.category }), _jsx("td", { className: "p-2 text-gray-800", children: f.description })] }, f.id))) })] }) }))] }), _jsxs("div", { className: "bg-white rounded-2xl shadow p-4", children: [_jsx("h2", { className: "font-semibold mb-2", children: "\u2463 Next" }), _jsxs("ol", { className: "text-sm text-gray-600 list-decimal pl-5 space-y-1", children: [_jsx("li", { children: "\uC9C0\uAE08\uC740 \uC11C\uBC84\uC5D0\uC11C \uAC04\uB2E8 \uC720\uC0AC\uB3C4\uB85C \uD310\uC815\uD569\uB2C8\uB2E4." }), _jsx("li", { children: "Phase 3/4\uC5D0\uC11C \uC5C5\uB85C\uB4DC/\uC790\uB3D9\uC218\uC9D1(API \uC5F0\uB3D9)\uB85C \uD655\uC7A5\uD558\uC138\uC694." })] })] })] })] })] }));
}

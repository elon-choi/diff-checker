export type Platform = 'SPEC' | 'FIGMA' | 'WEB' | 'ANDROID' | 'IOS';
export type Phase = 1 | 2 | 3 | 4;
export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO' | 'WARN';
export type Category = 'TEXT_MISMATCH' | 'MISSING_ELEMENT' | 'VISIBILITY' | 'POLICY' | 'STRUCTURE';

export interface Finding {
  id: string;
  severity: Severity;
  category: Category;
  description: string;
  evidence?: Record<string, any>;
}

export interface UUMNode {
  platform: Platform;
  role?: string;
  name?: string;
  text?: string;
  visible?: boolean;
  path?: string;
}

export interface UUMDoc {
  platform: Platform;
  nodes: UUMNode[];
}

export function normalizeText(s?: string) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
}

export function similarity(a: string, b: string) {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  const inter = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union;
}

// Demo normalizers used server-side (same shape as FE demo)
export function specToDoc(specText: string): UUMDoc {
  const lines = (specText || '')
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

export function figmaJsonToDoc(figma: any): UUMDoc {
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
    if (Array.isArray(node.children)) node.children.forEach((c: any) => walk(c, thisPath));
  }
  walk(figma, []);
  return { platform: 'FIGMA', nodes };
}

export function webJsonToDoc(web: any): UUMDoc {
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

export function mobileJsonToDoc(anyJson: any, platform: 'ANDROID' | 'IOS'): UUMDoc {
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

export function runDiff(
  phase: Phase,
  specDoc?: UUMDoc,
  figmaDoc?: UUMDoc,
  webDoc?: UUMDoc,
  androidDoc?: UUMDoc,
  iosDoc?: UUMDoc
): Finding[] {
  const findings: Finding[] = [];
  const THRESH = 0.9;
  function uid() { return Math.random().toString(36).slice(2, 10); }
  const compareSpecTo = (target?: UUMDoc, label?: string) => {
    if (!specDoc || !target) return;
    for (const s of specDoc.nodes) {
      if (!s.text) continue;
      const sNorm = normalizeText(s.text);
      let best: UUMNode | null = null;
      let bestSim = -1;
      for (const t of target.nodes) {
        const sim = similarity(sNorm, normalizeText(t.text));
        if (sim > bestSim) { bestSim = sim; best = t; }
      }
      if (!best || bestSim < 0.1) {
        findings.push({
          id: uid(),
          severity: 'MAJOR',
          category: 'MISSING_ELEMENT',
          description: `Spec 문구를 ${label}에서 찾지 못함: "${s.text}"`,
          evidence: { spec: s, target },
        });
        continue;
      }
      if (bestSim < THRESH) {
        findings.push({
          id: uid(),
          severity: bestSim < 0.5 ? 'MAJOR' : 'MINOR',
          category: 'TEXT_MISMATCH',
          description: `${label} 문구 유사도 낮음 (${(bestSim*100).toFixed(0)}%): Spec="${s.text}" vs ${label}="${best?.text}"`,
          evidence: { spec: s, match: best },
        });
      }
    }
  };
  if (specDoc && figmaDoc) compareSpecTo(figmaDoc, 'Figma');
  if (phase >= 2 && specDoc && webDoc) compareSpecTo(webDoc, 'Web');
  if (phase >= 3 && specDoc && androidDoc) compareSpecTo(androidDoc, 'Android');
  if (phase >= 4 && specDoc && iosDoc) compareSpecTo(iosDoc, 'iOS');
  return findings;
}




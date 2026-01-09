import { DiffFinding, SpecItem, UUMDocument } from './types';
import { DiffRule } from './diff-engine';

function normalizeText(value?: string): string {
  return (value ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function includesText(haystack?: string, needle?: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!h || !n) return false;
  return h.includes(n);
}

function nodeMatchesSelector(node: any, selector?: string): boolean {
  if (!selector) return false;
  return (
    node?.selector === selector ||
    node?.path === selector ||
    (typeof node?.selector === 'string' && selector && node.selector.includes(selector)) ||
    (typeof node?.path === 'string' && selector && node.path.includes(selector))
  );
}

function pickNonSpecDocs(docs: UUMDocument[]): UUMDocument[] {
  return docs.filter((d) => d.platform !== 'SPEC');
}

function createNodeIndex(docs: UUMDocument[]): {
  bySelector: Map<string, UUMNode[]>;
  byRole: Map<string, UUMNode[]>;
  byPath: Map<string, UUMNode[]>;
  byText: Map<string, UUMNode[]>;
} {
  const bySelector = new Map<string, UUMNode[]>();
  const byRole = new Map<string, UUMNode[]>();
  const byPath = new Map<string, UUMNode[]>();
  const byText = new Map<string, UUMNode[]>();

  for (const doc of docs) {
    for (const node of doc.nodes) {
      if (node.selector) {
        const key = normalizeText(node.selector);
        if (!bySelector.has(key)) bySelector.set(key, []);
        bySelector.get(key)!.push(node);
      }
      if (node.role) {
        const key = normalizeText(node.role);
        if (!byRole.has(key)) byRole.set(key, []);
        byRole.get(key)!.push(node);
      }
      if (node.path) {
        const key = normalizeText(node.path);
        if (!byPath.has(key)) byPath.set(key, []);
        byPath.get(key)!.push(node);
      }
      if (node.text) {
        const key = normalizeText(node.text);
        if (!byText.has(key)) byText.set(key, []);
        byText.get(key)!.push(node);
      }
    }
  }

  return { bySelector, byRole, byPath, byText };
}

function calculateTextSimilarity(a: string, b: string): number {
  const aWords = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bWords = new Set(normalizeText(b).split(' ').filter(Boolean));
  const intersection = [...aWords].filter((w) => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union > 0 ? intersection / union : 0;
}

function findMatchingNode(
  item: SpecItem,
  docs: UUMDocument[],
  index: ReturnType<typeof createNodeIndex>
): { node: UUMNode; matchType: 'selector' | 'role' | 'path' | 'text' | 'similarity' | null } | null {
  const nonSpecDocs = pickNonSpecDocs(docs);

  if (item.selector) {
    const selectorNorm = normalizeText(item.selector);
    const selectorNodes = index.bySelector.get(selectorNorm);
    if (selectorNodes && selectorNodes.length > 0) {
      return { node: selectorNodes[0], matchType: 'selector' };
    }

    const roleNodes = index.byRole.get(selectorNorm);
    if (roleNodes && roleNodes.length > 0) {
      return { node: roleNodes[0], matchType: 'role' };
    }

    const pathNodes = index.byPath.get(selectorNorm);
    if (pathNodes && pathNodes.length > 0) {
      return { node: pathNodes[0], matchType: 'path' };
    }
  }

  if (item.text) {
    const textNorm = normalizeText(item.text);
    const exactTextNodes = index.byText.get(textNorm);
    if (exactTextNodes && exactTextNodes.length > 0) {
      return { node: exactTextNodes[0], matchType: 'text' };
    }

    let bestNode: UUMNode | null = null;
    let bestSimilarity = 0;
    for (const doc of nonSpecDocs) {
      for (const node of doc.nodes) {
        const nodeText = [node.text, node.name].filter(Boolean).join(' ');
        if (nodeText) {
          const similarity = calculateTextSimilarity(item.text, nodeText);
          if (similarity > bestSimilarity && similarity > 0.5) {
            bestSimilarity = similarity;
            bestNode = node;
          }
        }
      }
    }
    if (bestNode && bestSimilarity > 0.5) {
      return { node: bestNode, matchType: 'similarity' };
    }
  }

  return null;
}

export const textStrictRule: DiffRule = {
  id: 'text.strict',
  description: '스펙에 정의된 텍스트가 다른 문서(Figma/Web/앱)에 존재해야 한다.',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const nonSpecDocs = pickNonSpecDocs(docs);
    if (nonSpecDocs.length === 0) return [];

    const findings: DiffFinding[] = [];
    const index = createNodeIndex(nonSpecDocs);

    for (const item of specItems) {
      if (!item.text) continue;
      const expected = item.text.trim();

      const match = findMatchingNode(item, docs, index);

      if (!match) {
        findings.push({
          id: `text.strict:${item.id}`,
          severity: 'MAJOR',
          category: 'TEXT_MISMATCH',
          description: `스펙 텍스트가 미존재: "${expected}"`,
          evidence: {
            expected,
            checkedDocs: nonSpecDocs.map((d) => d.platform),
            matchType: null,
          },
          relatedSpecId: item.id,
        });
      } else if (match.matchType === 'similarity') {
        const similarity = calculateTextSimilarity(expected, match.node.text || match.node.name || '');
        if (similarity < 0.9) {
          findings.push({
            id: `text.strict:${item.id}`,
            severity: similarity < 0.7 ? 'MAJOR' : 'MINOR',
            category: 'TEXT_MISMATCH',
            description: `스펙 텍스트 유사도 낮음 (${(similarity * 100).toFixed(0)}%): "${expected}" vs "${match.node.text || match.node.name}"`,
            evidence: {
              expected,
              found: match.node.text || match.node.name,
              similarity,
              matchType: match.matchType,
            },
            relatedSpecId: item.id,
          });
        }
      }
    }
    return findings;
  },
};

export const missingElementRule: DiffRule = {
  id: 'missing.element',
  description: '스펙 상 노출 요구 요소가 대상 문서에 존재해야 한다.',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const nonSpecDocs = pickNonSpecDocs(docs);
    if (nonSpecDocs.length === 0) return [];

    const findings: DiffFinding[] = [];
    const index = createNodeIndex(nonSpecDocs);

    const requiredItems = specItems.filter((s) => s.kind === 'STATE' && s.visibility === 'show');
    for (const item of requiredItems) {
      const match = findMatchingNode(item, docs, index);

      if (!match) {
        const keyword = normalizeText(item.text) || normalizeText(item.selector);
        let matched = false;

        if (keyword) {
          for (const d of nonSpecDocs) {
            for (const n of d.nodes) {
              if (
                includesText(n.role, keyword) ||
                includesText(n.name, keyword) ||
                includesText(n.text, keyword)
              ) {
                matched = true;
                break;
              }
            }
            if (matched) break;
          }
        }

        if (!matched) {
          findings.push({
            id: `missing.element:${item.id}`,
            severity: 'CRITICAL',
            category: 'MISSING_ELEMENT',
            description: `스펙 요소가 대상 문서에 없음: "${item.text ?? item.selector ?? item.id}"`,
            evidence: {
              item,
              checkedDocs: nonSpecDocs.map((d) => d.platform),
              matchType: null,
            },
            relatedSpecId: item.id,
          });
        }
      }
    }
    return findings;
  },
};

export const visibilityRule: DiffRule = {
  id: 'visibility.requirement',
  description: '스펙의 show/hide 요구 사항을 가시성으로 검증한다.',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const nonSpecDocs = pickNonSpecDocs(docs);
    if (nonSpecDocs.length === 0) return [];

    const findings: DiffFinding[] = [];
    const visItems = specItems.filter((s) => s.kind === 'STATE' && s.visibility);
    const index = createNodeIndex(nonSpecDocs);

    for (const item of visItems) {
      const shouldShow = item.visibility === 'show';
      const match = findMatchingNode(item, docs, index);

      if (match) {
        const isVisible = match.node.visible !== false;
        if (shouldShow && !isVisible) {
          findings.push({
            id: `visibility:${item.id}`,
            severity: 'MAJOR',
            category: 'VISIBILITY',
            description: `스펙상 노출되어야 하나 숨김 상태: "${item.text ?? item.selector}"`,
            evidence: {
              item,
              node: match.node,
              matchType: match.matchType,
              checkedDocs: nonSpecDocs.map((d) => d.platform),
            },
            relatedSpecId: item.id,
          });
        } else if (!shouldShow && isVisible) {
          findings.push({
            id: `visibility:${item.id}`,
            severity: 'MINOR',
            category: 'VISIBILITY',
            description: `스펙상 숨겨져야 하나 노출 상태: "${item.text ?? item.selector}"`,
            evidence: {
              item,
              node: match.node,
              matchType: match.matchType,
              checkedDocs: nonSpecDocs.map((d) => d.platform),
            },
            relatedSpecId: item.id,
          });
        }
      } else {
        findings.push({
          id: `visibility:${item.id}`,
          severity: shouldShow ? 'MAJOR' : 'MINOR',
          category: 'VISIBILITY',
          description: shouldShow
            ? `스펙상 노출되어야 하나 가시성 충족 요소를 찾지 못함: "${item.text ?? item.selector}"`
            : `스펙상 숨겨져야 하나 숨김 충족 요소를 찾지 못함: "${item.text ?? item.selector}"`,
          evidence: {
            item,
            checkedDocs: nonSpecDocs.map((d) => d.platform),
            matchType: null,
          },
          relatedSpecId: item.id,
        });
      }
    }
    return findings;
  },
};

export const policyRule: DiffRule = {
  id: 'policy.basic',
  description: '간단한 정책 키워드(예: 성인/로그인/제한) 존재 여부를 점검한다.',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const keywords = ['성인', '로그인', '제한', '동의', '확인'];
    const nonSpecDocs = pickNonSpecDocs(docs);
    const policyItems = specItems.filter((s) => s.kind === 'POLICY' || (s.text && keywords.some(k => s.text!.includes(k))));

    for (const item of policyItems) {
      let satisfied = false;
      for (const d of nonSpecDocs) {
        for (const n of d.nodes) {
          if (includesText(n.text, item.text) || includesText(n.name, item.text)) {
            satisfied = true;
            break;
          }
        }
        if (satisfied) break;
      }
      if (!satisfied) {
        findings.push({
          id: `policy:${item.id}`,
          severity: 'MINOR',
          category: 'POLICY',
          description: `정책 관련 항목 확인 필요: "${item.text ?? item.id}"`,
          evidence: { item, checkedDocs: nonSpecDocs.map((d) => d.platform) },
          relatedSpecId: item.id,
        });
      }
    }
    return findings;
  },
};

export const structureRule: DiffRule = {
  id: 'structure.basic',
  description: '문서 구조가 비정상(빈 문서/루트 누락)인 경우를 보고한다.',
  apply(docs: UUMDocument[]): DiffFinding[] {
    const findings: DiffFinding[] = [];
    for (const d of docs) {
      if (!d.nodes || d.nodes.length === 0) {
        findings.push({
          id: `structure:empty:${d.platform}`,
          severity: 'INFO',
          category: 'STRUCTURE',
          description: `${d.platform} 문서가 비어있음`,
          evidence: { platform: d.platform, doc: d },
        });
        continue;
      }
      const hasRoot = d.nodes.some((n) => n.role === 'DOCUMENT' || n.path?.endsWith('/0') || n.path?.includes('/root'));
      if (!hasRoot) {
        findings.push({
          id: `structure:root-missing:${d.platform}`,
          severity: 'INFO',
          category: 'STRUCTURE',
          description: `${d.platform} 문서에 루트 추정 노드가 없음`,
          evidence: { firstNodes: d.nodes.slice(0, 3) },
        });
      }
    }
    return findings;
  },
};

// 역방향 비교 규칙: Figma의 UI 텍스트가 Spec에 언급되는지 확인
// 구조화되지 않은 자연어 Spec과도 비교 가능
export const reverseComparisonRule: DiffRule = {
  id: 'reverse.comparison',
  description: 'Figma의 UI 텍스트가 Spec 문서에 언급되는지 확인 (역방향 비교)',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');

    if (!figmaDoc) return findings;

    // SpecItems만 사용 (필터링된 UI 텍스트만)
    const specTexts = specItems
      .filter((item) => item.kind === 'TEXT' && item.text)
      .map((item) => normalizeText(item.text!))
      .filter(Boolean);

    // Spec 문서 전체 텍스트도 생성 (키워드 매칭용)
    const specDoc = docs.find((d) => d.platform === 'SPEC');
    const specFullText = specDoc
      ? specDoc.nodes
          .map((n) => n.text || '')
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      : '';

    // Figma의 TEXT 노드만 확인 (실제 UI 텍스트만)
    for (const figmaNode of figmaDoc.nodes) {
      // TEXT 노드만 확인 (role이 TEXT이고 text가 있는 경우만)
      if (figmaNode.role !== 'TEXT' || !figmaNode.text) {
        continue;
      }

      // visible이 false인 노드는 제외
      if (figmaNode.visible === false) {
        continue;
      }

      const figmaText = figmaNode.text; // characters만 사용 (name 제외)
      if (!figmaText || figmaText.trim().length < 2) continue;

      const normalizedFigmaText = normalizeText(figmaText);

      // 너무 짧거나 일반적인 단어는 제외
      if (normalizedFigmaText.length < 2) continue;
      const commonWords = [
        'the',
        'a',
        'an',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'to',
        'of',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'for',
        'with',
        'by',
      ];
      if (commonWords.includes(normalizedFigmaText)) continue;

      // Figma 내부 레이블 제외 (이미 FigmaNormalizer에서 필터링되지만 이중 체크)
      const figmaInternalLabels = [
        'document',
        'title',
        'screen',
        'sub',
        'txt',
        'line',
        'body',
        'frame',
        'component',
        'instance',
        'layer',
        'group',
        'vector',
        'rectangle',
        'ellipse',
        'text',
      ];
      if (figmaInternalLabels.includes(normalizedFigmaText)) continue;

      // 색상 코드 제외
      if (/^#[0-9a-f]{3,6}$/i.test(figmaText)) continue;

      // Boolean/null 값 제외
      if (/^(true|false|none|null|undefined)$/i.test(figmaText)) continue;

      // SpecItems에서 정확히 매칭되는지 확인
      let mentioned = false;

      // 1. SpecItems에서 정확한 텍스트 매칭
      for (const specText of specTexts) {
        if (
          specText === normalizedFigmaText ||
          specText.includes(normalizedFigmaText) ||
          normalizedFigmaText.includes(specText)
        ) {
          mentioned = true;
          break;
        }
      }

      // 2. 키워드 부분 매칭 시도 (Spec 전체 텍스트에서)
      if (!mentioned && specFullText) {
        const words = normalizedFigmaText.split(' ').filter((w) => w.length > 2);
        const partialMatch = words.some((word) => includesText(specFullText, word));
        if (partialMatch) {
          mentioned = true;
        }
      }

      if (!mentioned) {
        // 헌장 반영: QA 기준 "확인 필요 영역 식별" 단위로 Diff 결과 생성
        // 결함 확정이 아닌 "QA가 확인해야 하는 요구사항 불일치 가능성"으로 표현
        // 기존 description 형식 유지 (호환성 보장)
        findings.push({
          id: `reverse:${figmaNode.uid}`,
          severity: 'MAJOR',
          category: 'MISSING_ELEMENT',
          description: `Figma에 표시된 UI 텍스트 "${figmaText}"가 Spec 문서에 언급되지 않음 (확인 필요)`,
          evidence: {
            figmaText,
            figmaNode,
            specTexts: specTexts.slice(0, 10), // 디버깅용 (처음 10개만)
            // 헌장 반영: QA 판단을 위한 RequirementItem 정보 추가 (기존 필드 유지)
            intent: 'Spec 문서에 명시된 UI 텍스트와 Figma 디자인 간 일관성 확인',
            expected: figmaText,
            scope: figmaNode.path || '전체',
          },
          relatedSpecId: figmaNode.uid,
        });
      }
    }

    return findings;
  },
};

export const defaultRules: DiffRule[] = [
  reverseComparisonRule, // 역방향 비교 (1차 기준 - Figma → Spec)
  textStrictRule, // 정방향 비교 (구조화된 항목만)
  missingElementRule,
  visibilityRule,
  policyRule,
  structureRule,
];







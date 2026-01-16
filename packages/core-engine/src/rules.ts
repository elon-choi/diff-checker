import { DiffFinding, SpecItem, UUMDocument, UUMNode } from './types';
import { DiffRule } from './diff-engine';
import { LLMAdapter } from '../../../adapters/llm-adapter/src/index';

function normalizeText(value?: string): string {
  return (value ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isMetadataLikeLabel(text?: string): boolean {
  if (!text) return false;
  const normalized = normalizeText(text);
  const hasUpdateLabel = normalized.includes('last update') || normalized.includes('업데이트');
  const hasDate = /\d{4}[./-]\d{1,2}[./-]\d{1,2}/.test(normalized) || /\d{1,2}[./-]\d{1,2}/.test(normalized);
  return hasUpdateLabel && hasDate;
}

const UI_TYPE_WORD_PATTERN = /(버튼|텍스트|체크\s*박스|체크박스|라벨|옵션|입력|선택|토글|스위치|링크|탭|메뉴)/g;

function stripUiTypeWords(value?: string): string {
  if (!value) return '';
  return value
    .replace(UI_TYPE_WORD_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

// Phase-2: selectorKey 기반 1:1 매핑 규칙 (우선 적용)
// Figma와 Web 모두 처리
export const keyedDiffRule: DiffRule = {
  id: 'keyed.diff',
  description: 'selectorKey 기반 SpecItem ↔ Platform Node 1:1 매핑 비교 (Figma, Web)',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const findings: DiffFinding[] = [];
    
    // Figma와 Web 문서 찾기
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
    const webDoc = docs.find((d) => d.platform === 'WEB');
    
    // 둘 다 없으면 처리하지 않음
    if (!figmaDoc && !webDoc) return findings;

    // selectorKey가 있는 SpecItem만 처리
    const keyedSpecItems = specItems.filter((item) => item.kind === 'TEXT' && item.text && item.selectorKey);
    
    // Figma 노드를 selectorKey로 인덱싱
    const figmaByKey = new Map<string, typeof figmaDoc.nodes>();
    if (figmaDoc) {
      for (const node of figmaDoc.nodes) {
        if (node.role === 'TEXT' && node.selectorKey) {
          if (!figmaByKey.has(node.selectorKey)) {
            figmaByKey.set(node.selectorKey, []);
          }
          figmaByKey.get(node.selectorKey)!.push(node);
        }
      }
    }
    
    // Web 노드를 selectorKey로 인덱싱
    const webByKey = new Map<string, typeof webDoc.nodes>();
    if (webDoc) {
      for (const node of webDoc.nodes) {
        // Web은 role이 TEXT가 아니어도 텍스트가 있으면 처리
        if (node.text && node.selectorKey) {
          if (!webByKey.has(node.selectorKey)) {
            webByKey.set(node.selectorKey, []);
          }
          webByKey.get(node.selectorKey)!.push(node);
        }
      }
    }

    const textSpecItems = specItems.filter((item) => item.kind === 'TEXT' && item.text);
    const specItemsCount = textSpecItems.length;

    // SpecItem별로 매핑 확인 (Figma와 Web 각각 처리)
    for (const specItem of keyedSpecItems) {
      const selectorKey = specItem.selectorKey!;
      const specText = specItem.text!.trim();
      
      // Figma 매칭 확인
      if (figmaDoc) {
        const figmaNodes = figmaByKey.get(selectorKey) || [];
        if (figmaNodes.length === 0) {
          findings.push({
            id: `keyed.missing.figma:${specItem.id}`,
            severity: 'MAJOR',
            category: 'MISSING_ELEMENT',
            description: `Spec 요구사항 "${specText}" (Key: ${selectorKey})가 Figma에 없음`,
            evidence: {
              expected: specText,
              selectorKey,
              specItem,
              platform: 'FIGMA',
            },
            relatedSpecId: specItem.id,
            selectorKey,
            diffType: 'MISSING',
            requirement: specItem.sectionPath,
            meta: {
              ...specItem.meta,
              ruleName: 'keyed.diff',
              ruleReason: `selectorKey "${selectorKey}"로 매핑된 Figma 노드가 없음`,
              recommendedAction: 'design-update' as const,
            },
            specSideEvidence: {
              spec_section: specItem.meta?.section,
              spec_row: specItem.meta?.row,
              spec_feature: specItem.meta?.feature,
              spec_text: specText,
              spec_items_count: specItemsCount,
            },
            decisionMetadata: {
              rule_name: 'keyed.diff',
              decision_reason_code: 'SPEC_CONFIRMED_MISSING',
              decision_explanation: `Spec에 정의된 selectorKey "${selectorKey}"에 해당하는 Figma 노드가 없습니다.`,
            },
          });
        } else {
          const figmaNode = figmaNodes[0];
          const figmaText = figmaNode.text?.trim() || '';
          if (specText !== figmaText) {
            const similarity = calculateTextSimilarity(specText, figmaText);
            findings.push({
              id: `keyed.changed.figma:${specItem.id}`,
              severity: similarity < 0.7 ? 'MAJOR' : 'MINOR',
              category: 'TEXT_MISMATCH',
              description: `Spec 요구사항 "${specText}" (Key: ${selectorKey})가 Figma에서 "${figmaText}"로 변경됨`,
              evidence: {
                expected: specText,
                found: figmaText,
                selectorKey,
                similarity,
                specItem,
                figmaNode,
                platform: 'FIGMA',
              },
              relatedSpecId: specItem.id,
              selectorKey,
              diffType: 'CHANGED',
              requirement: specItem.sectionPath,
              meta: {
                ...specItem.meta,
                ruleName: 'keyed.diff',
                ruleReason: `selectorKey "${selectorKey}"로 매핑된 텍스트가 다름: "${specText}" vs "${figmaText}"`,
                recommendedAction: similarity < 0.7 ? 'design-update' as const : 'spec-update' as const,
              },
              specSideEvidence: {
                spec_section: specItem.meta?.section,
                spec_row: specItem.meta?.row,
                spec_feature: specItem.meta?.feature,
                spec_text: specText,
                spec_items_count: specItemsCount,
              },
              figmaSideEvidence: {
                figma_text: figmaText,
                figma_frame_path: figmaNode.path,
                figma_layer_name: figmaNode.name,
              },
              decisionMetadata: {
                rule_name: 'keyed.diff',
                decision_reason_code: 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL',
                decision_explanation: `selectorKey "${selectorKey}"로 매핑된 텍스트가 다릅니다. (유사도: ${(similarity * 100).toFixed(0)}%)`,
              },
            });
          }
        }
      }
      
      // Web 매칭 확인
      if (webDoc) {
        const webNodes = webByKey.get(selectorKey) || [];
        if (webNodes.length === 0) {
          findings.push({
            id: `keyed.missing.web:${specItem.id}`,
            severity: 'MAJOR',
            category: 'MISSING_ELEMENT',
            description: `Spec 요구사항 "${specText}" (Key: ${selectorKey})가 Web에 없음`,
            evidence: {
              expected: specText,
              selectorKey,
              specItem,
              platform: 'WEB',
            },
            relatedSpecId: specItem.id,
            selectorKey,
            diffType: 'MISSING',
            requirement: specItem.sectionPath,
            meta: {
              ...specItem.meta,
              ruleName: 'keyed.diff',
              ruleReason: `selectorKey "${selectorKey}"로 매핑된 Web 노드가 없음`,
              recommendedAction: 'design-update' as const,
            },
            specSideEvidence: {
              spec_section: specItem.meta?.section,
              spec_row: specItem.meta?.row,
              spec_feature: specItem.meta?.feature,
              spec_text: specText,
              spec_items_count: specItemsCount,
            },
            decisionMetadata: {
              rule_name: 'keyed.diff',
              decision_reason_code: 'SPEC_CONFIRMED_MISSING',
              decision_explanation: `Spec에 정의된 selectorKey "${selectorKey}"에 해당하는 Web 노드가 없습니다.`,
            },
          });
        } else {
          const webNode = webNodes[0];
          const webText = webNode.text?.trim() || '';
          if (specText !== webText) {
            const similarity = calculateTextSimilarity(specText, webText);
            findings.push({
              id: `keyed.changed.web:${specItem.id}`,
              severity: similarity < 0.7 ? 'MAJOR' : 'MINOR',
              category: 'TEXT_MISMATCH',
              description: `Spec 요구사항 "${specText}" (Key: ${selectorKey})가 Web에서 "${webText}"로 변경됨`,
              evidence: {
                expected: specText,
                found: webText,
                selectorKey,
                similarity,
                specItem,
                webNode,
                platform: 'WEB',
              },
              relatedSpecId: specItem.id,
              selectorKey,
              diffType: 'CHANGED',
              requirement: specItem.sectionPath,
              meta: {
                ...specItem.meta,
                ruleName: 'keyed.diff',
                ruleReason: `selectorKey "${selectorKey}"로 매핑된 텍스트가 다름: "${specText}" vs "${webText}"`,
                recommendedAction: similarity < 0.7 ? 'design-update' as const : 'spec-update' as const,
              },
              specSideEvidence: {
                spec_section: specItem.meta?.section,
                spec_row: specItem.meta?.row,
                spec_feature: specItem.meta?.feature,
                spec_text: specText,
                spec_items_count: specItemsCount,
              },
              decisionMetadata: {
                rule_name: 'keyed.diff',
                decision_reason_code: 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL',
                decision_explanation: `selectorKey "${selectorKey}"로 매핑된 텍스트가 다릅니다. (유사도: ${(similarity * 100).toFixed(0)}%)`,
              },
            });
          }
        }
      }
    }

    // EXTRA: Figma에 있지만 Spec에 없는 selectorKey
    const specKeys = new Set(keyedSpecItems.map(item => item.selectorKey!));
    for (const [key, nodes] of figmaByKey.entries()) {
      if (!specKeys.has(key)) {
        const figmaNode = nodes[0];
        const figmaText = figmaNode.text?.trim() || '';
        findings.push({
          id: `keyed.extra:${figmaNode.uid}`,
          severity: 'MINOR',
          category: 'MISSING_ELEMENT',
          description: `Figma에 "${figmaText}" (Key: ${key})가 있지만 Spec에 없음`,
          evidence: {
            figmaText,
            selectorKey: key,
            figmaNode,
          },
          relatedSpecId: figmaNode.uid,
          selectorKey: key,
          diffType: 'EXTRA',
          meta: {
            ruleName: 'keyed.diff',
            ruleReason: `Figma의 selectorKey "${key}"가 Spec에 정의되지 않음`,
            recommendedAction: 'spec-update' as const,
          },
          figmaSideEvidence: {
            figma_text: figmaText,
            figma_frame_path: figmaNode.path,
            figma_layer_name: figmaNode.name,
          },
          decisionMetadata: {
            rule_name: 'keyed.diff',
            decision_reason_code: 'FIGMA_ANNOTATION_SUSPECT',
            decision_explanation: `Figma에 selectorKey "${key}"가 있지만 Spec에 정의되지 않았습니다.`,
          },
        });
      }
    }

    return findings;
  },
};

export const textStrictRule: DiffRule = {
  id: 'text.strict',
  description: '스펙에 정의된 텍스트가 다른 문서(Figma/Web/앱)에 존재해야 한다. (UNMAPPED fallback)',
  apply(docs: UUMDocument[], specItems: SpecItem[]): DiffFinding[] {
    const nonSpecDocs = pickNonSpecDocs(docs);
    if (nonSpecDocs.length === 0) return [];

    const findings: DiffFinding[] = [];
    const index = createNodeIndex(nonSpecDocs);
    
    // Phase-2: selectorKey가 없는 SpecItem만 처리 (UNMAPPED fallback)
    const unmappedSpecItems = specItems.filter(
      (item) => item.kind === 'TEXT' && item.text && !item.selectorKey
    );
    const textSpecItems = specItems.filter((item) => item.kind === 'TEXT' && item.text);
    const specItemsCount = textSpecItems.length;

    const specDoc = docs.find((d) => d.platform === 'SPEC');
    const specFullText = specDoc
      ? specDoc.nodes
          .map((n) => n.text || '')
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      : '';

    const countSpecFulltextHits = (searchText: string): number => {
      if (!specFullText) return 0;
      const normalized = normalizeText(searchText);
      const regex = new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = specFullText.match(regex);
      return matches ? matches.length : 0;
    };

    for (const item of unmappedSpecItems) {
      if (!item.text) continue;
      const expected = item.text.trim();

      let match = findMatchingNode(item, docs, index);
      if (!match) {
        const strippedText = stripUiTypeWords(expected);
        if (strippedText && strippedText !== expected && strippedText.length >= 2) {
          match = findMatchingNode({ ...item, text: strippedText }, docs, index);
          if (match) {
            continue;
          }
        }
      }

      if (!match) {
        const specFulltextHits = countSpecFulltextHits(expected);
        let decisionReasonCode: 'SPEC_CONFIRMED_MISSING' | 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL' = 'SPEC_CONFIRMED_MISSING';
        let decisionExplanation = '';

        if (specFulltextHits > 0) {
          decisionReasonCode = 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL';
          decisionExplanation = `Spec 전체 텍스트에서 "${expected}"가 ${specFulltextHits}번 발견되었지만 정규화 과정에서 매칭에 실패했습니다.`;
        } else {
          decisionReasonCode = 'SPEC_CONFIRMED_MISSING';
          decisionExplanation = `Spec에 정의된 텍스트 "${expected}"가 Figma/Web/앱에 존재하지 않습니다.`;
        }

        findings.push({
          id: `text.strict:${item.id}`,
          severity: 'MAJOR',
          category: 'TEXT_MISMATCH',
          description: `스펙 텍스트가 미존재: "${expected}"`,
          evidence: {
            expected,
            checkedDocs: nonSpecDocs.map((d) => d.platform),
            matchType: null,
            specItem: item,
          },
          relatedSpecId: item.id,
          meta: {
            ...item.meta,
            ruleName: 'text.strict',
            ruleReason: `Spec에 정의된 텍스트 "${expected}"가 Figma/Web/앱에 존재하지 않음`,
            recommendedAction: 'design-update' as const,
          },
          specSideEvidence: {
            spec_section: item.meta?.section,
            spec_row: item.meta?.row,
            spec_feature: item.meta?.feature,
            spec_text: expected,
            spec_items_count: specItemsCount,
            spec_fulltext_hits: specFulltextHits,
          },
          decisionMetadata: {
            rule_name: 'text.strict',
            decision_reason_code: decisionReasonCode,
            decision_explanation: decisionExplanation,
          },
          diffType: 'UNMAPPED',
          requirement: item.sectionPath,
        });
      } else if (match.matchType === 'similarity') {
        const similarity = calculateTextSimilarity(expected, match.node.text || match.node.name || '');
        if (similarity < 0.9) {
          const foundText = match.node.text || match.node.name || '';
          const specFulltextHits = countSpecFulltextHits(expected);
          
          findings.push({
            id: `text.strict:${item.id}`,
            severity: similarity < 0.7 ? 'MAJOR' : 'MINOR',
            category: 'TEXT_MISMATCH',
            description: `스펙 텍스트 유사도 낮음 (${(similarity * 100).toFixed(0)}%): "${expected}" vs "${foundText}"`,
            evidence: {
              expected,
              found: foundText,
              similarity,
              matchType: match.matchType,
              specItem: item,
            },
            relatedSpecId: item.id,
            meta: {
              ...item.meta,
              ruleName: 'text.strict',
              ruleReason: `Spec 텍스트 "${expected}"와 실제 텍스트 "${foundText}"의 유사도가 낮음 (${(similarity * 100).toFixed(0)}%)`,
              recommendedAction: similarity < 0.7 ? 'design-update' as const : 'spec-update' as const,
            },
            specSideEvidence: {
              spec_section: item.meta?.section,
              spec_row: item.meta?.row,
              spec_feature: item.meta?.feature,
              spec_text: expected,
              spec_items_count: specItemsCount,
              spec_fulltext_hits: specFulltextHits,
            },
            figmaSideEvidence: match.node.platform === 'FIGMA' ? {
              figma_text: foundText,
              figma_page: match.node.meta?.page,
              figma_frame_path: match.node.path,
              figma_layer_name: match.node.name,
            } : undefined,
            matchingEvidence: {
              match_candidates: [{
                text: foundText,
                section: item.meta?.section,
                row: item.meta?.row,
                similarity,
              }],
            },
            decisionMetadata: {
              rule_name: 'text.strict',
              decision_reason_code: 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL',
              decision_explanation: `Spec 텍스트 "${expected}"와 실제 텍스트 "${foundText}"의 유사도가 낮아 정규화 과정에서 매칭에 실패했습니다. (유사도: ${(similarity * 100).toFixed(0)}%)`,
            },
            diffType: 'UNMAPPED',
            requirement: item.sectionPath,
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
          diffType: 'MISSING',
          requirement: item.sectionPath,
          meta: {
            ...item.meta,
            ruleName: 'policy.basic',
            ruleReason: `정책 관련 항목 "${item.text ?? item.id}"이(가) Figma/Web/앱에 존재하지 않음`,
            recommendedAction: 'design-update' as const,
          },
          specSideEvidence: {
            spec_section: item.meta?.section,
            spec_row: item.meta?.row,
            spec_feature: item.meta?.feature,
            spec_text: item.text,
          },
          decisionMetadata: {
            rule_name: 'policy.basic',
            decision_reason_code: 'SPEC_CONFIRMED_MISSING',
            decision_explanation: `정책 관련 항목 "${item.text ?? item.id}"이(가) Spec에 정의되어 있지만 Figma/Web/앱에 존재하지 않습니다.`,
          },
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
    const specDoc = docs.find((d) => d.platform === 'SPEC');

    if (!figmaDoc) return findings;

    // SpecItems만 사용 (필터링된 UI 텍스트만)
    const textSpecItems = specItems.filter((item) => item.kind === 'TEXT' && item.text);
    const specTexts = textSpecItems.map((item) => normalizeText(item.text!)).filter(Boolean);
    const specItemsCount = textSpecItems.length;

    // Spec 문서 전체 텍스트도 생성 (키워드 매칭용)
    const specFullText = specDoc
      ? specDoc.nodes
          .map((n) => n.text || '')
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      : '';

    // Spec 전체 텍스트에서 특정 텍스트 검색 hit 개수 계산
    const countSpecFulltextHits = (searchText: string): number => {
      if (!specFullText) return 0;
      const normalized = normalizeText(searchText);
      const regex = new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = specFullText.match(regex);
      return matches ? matches.length : 0;
    };

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

      // 텍스트 노드 크기가 매우 작은 경우 제외 (화면에 보이지 않는 텍스트)
      if (figmaNode.bounds) {
        const width = figmaNode.bounds.w || 0;
        const height = figmaNode.bounds.h || 0;
        // 너비나 높이가 10px 미만이면 제외 (실제로 보이지 않는 텍스트)
        if (width < 10 && height < 10) {
          continue;
        }
      }

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

      // 디자인 문서 설명 텍스트 제외 (as-is/to-be, 수정 전/후 등)
      const designDocumentLabels = [
        '수정전',
        '수정후',
        '수정 전',
        '수정 후',
        'asis',
        'tobe',
        'as-is',
        'to-be',
        'as is',
        'to be',
        'before',
        'after',
        '변경전',
        '변경후',
        '변경 전',
        '변경 후',
        '개선전',
        '개선후',
        '개선 전',
        '개선 후',
      ];
      if (designDocumentLabels.includes(normalizedFigmaText) || 
          normalizedFigmaText.includes('수정전') || 
          normalizedFigmaText.includes('수정후') ||
          normalizedFigmaText.includes('수정 전') ||
          normalizedFigmaText.includes('수정 후') ||
          normalizedFigmaText.includes('as-is') ||
          normalizedFigmaText.includes('to-be') ||
          normalizedFigmaText.includes('asis') ||
          normalizedFigmaText.includes('tobe')) {
        continue;
      }

      // 색상 코드 제외
      if (/^#[0-9a-f]{3,6}$/i.test(figmaText)) continue;

      // Boolean/null 값 제외
      if (/^(true|false|none|null|undefined)$/i.test(figmaText)) continue;

      // 업데이트 라벨(메타데이터) 제외
      if (isMetadataLikeLabel(figmaText)) continue;

    // Phase-2: selectorKey가 있는 Figma 노드는 keyedDiffRule에서 처리했으므로 건너뛰기
    if (figmaNode.selectorKey) {
      continue; // selectorKey가 있으면 keyedDiffRule에서 처리됨
    }

    // SpecItems에서 정확히 매칭되는지 확인
    let mentioned = false;
    let matchedSpecItem: SpecItem | undefined;

    // 1. SpecItems에서 정확한 텍스트 매칭
    for (const specItem of textSpecItems) {
      const specText = normalizeText(specItem.text!);
      if (
        specText === normalizedFigmaText ||
        specText.includes(normalizedFigmaText) ||
        normalizedFigmaText.includes(specText)
      ) {
        mentioned = true;
        matchedSpecItem = specItem;
        break;
      }
    }

      // 2. 키워드 부분 매칭 시도 (Spec 전체 텍스트에서)
      let specFulltextHits = 0;
      if (!mentioned && specFullText) {
        const words = normalizedFigmaText.split(' ').filter((w) => w.length > 2);
        const partialMatch = words.some((word) => includesText(specFullText, word));
        if (partialMatch) {
          mentioned = true;
        }
        specFulltextHits = countSpecFulltextHits(figmaText);
      } else if (mentioned) {
        specFulltextHits = countSpecFulltextHits(figmaText);
      }

      if (!mentioned) {
        // Figma 텍스트와 가장 유사한 SpecItem 찾기 (매칭 후보)
        const candidates: Array<{ item: SpecItem; similarity: number }> = [];
        for (const item of textSpecItems) {
          if (item.text) {
            const similarity = calculateTextSimilarity(figmaText, item.text);
            if (similarity > 0.1) {
              candidates.push({ item, similarity });
            }
          }
        }
        candidates.sort((a, b) => b.similarity - a.similarity);
        const top3Candidates = candidates.slice(0, 3).map(c => ({
          text: c.item.text!,
          section: c.item.meta?.section,
          row: c.item.meta?.row,
          similarity: c.similarity,
        }));
        
        // 가장 유사한 SpecItem의 meta 정보 사용
        const bestMatch = candidates[0];
        const specMeta = bestMatch?.item.meta;

        // decision_reason_code 결정
        let decisionReasonCode: 'SPEC_CONFIRMED_MISSING' | 'FIGMA_ANNOTATION_SUSPECT' | 'CONTENT_TEXT' | 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL' = 'SPEC_CONFIRMED_MISSING';
        let decisionExplanation = '';

        // FIGMA_ANNOTATION_SUSPECT 체크 (툴팁, 설명 등)
        const annotationKeywords = ['툴팁', '설명', '도움말', '안내', 'tip', 'tooltip', 'help', 'guide'];
        const isAnnotation = annotationKeywords.some(keyword => 
          normalizedFigmaText.includes(keyword.toLowerCase()) || 
          figmaNode.path?.toLowerCase().includes(keyword.toLowerCase())
        );

        // 해상도 라벨(예: "320 해상도")은 메타데이터로 간주
        const isResolutionLabel = /(^\d{3,4}\s*해상도$)|(\b해상도\b)/i.test(normalizedFigmaText);

        // CONTENT_TEXT 체크 (작가명, 해시태그, 작품명 등)
        const contentKeywords = ['작가', '작품', '해시태그', '태그', 'author', 'hashtag', 'tag', '작품명'];
        const isContentText = contentKeywords.some(keyword => 
          normalizedFigmaText.includes(keyword.toLowerCase())
        );

        if (isAnnotation || isResolutionLabel) {
          decisionReasonCode = 'FIGMA_ANNOTATION_SUSPECT';
          decisionExplanation = isResolutionLabel
            ? `Figma 텍스트 "${figmaText}"는 해상도 라벨(메타데이터)로 보입니다.`
            : `Figma 텍스트 "${figmaText}"는 툴팁/설명 등 주석성 텍스트로 보입니다.`;
        } else if (isContentText) {
          decisionReasonCode = 'CONTENT_TEXT';
          decisionExplanation = `Figma 텍스트 "${figmaText}"는 작가명/해시태그/작품명 등 콘텐츠 텍스트로 보입니다.`;
        } else if (specFulltextHits > 0) {
          decisionReasonCode = 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL';
          decisionExplanation = `Spec 전체 텍스트에서 "${figmaText}"가 ${specFulltextHits}번 발견되었지만 정규화 과정에서 매칭에 실패했습니다.`;
        } else {
          decisionReasonCode = 'SPEC_CONFIRMED_MISSING';
          decisionExplanation = `Figma 텍스트 "${figmaText}"가 Spec에 명시적으로 언급되지 않습니다.`;
        }
        
        // Phase-2: reverseComparisonRule은 기본적으로 MINOR로 낮춤 (selectorKey 없는 노드만)
        let severity: 'MINOR' | 'INFO' = 'MINOR';
        if (decisionReasonCode === 'FIGMA_ANNOTATION_SUSPECT' || decisionReasonCode === 'CONTENT_TEXT') {
          severity = 'INFO';
        }
        
        // 추천 액션 결정
        let recommendedAction: 'spec-update' | 'design-update' | 'ignore-noise' = 'spec-update';
        if (bestMatch && bestMatch.similarity > 0.7) {
          recommendedAction = 'design-update';
        } else if (bestMatch && bestMatch.similarity < 0.3) {
          recommendedAction = 'ignore-noise';
        } else if (decisionReasonCode === 'FIGMA_ANNOTATION_SUSPECT' || decisionReasonCode === 'CONTENT_TEXT') {
          recommendedAction = 'ignore-noise';
        }
        
        findings.push({
          id: `reverse:${figmaNode.uid}`,
          severity,
          category: 'MISSING_ELEMENT',
          description: `Figma에 표시된 UI 텍스트 "${figmaText}"가 Spec 문서에 언급되지 않음 (확인 필요)`,
          evidence: {
            figmaText,
            figmaNode,
            specTexts: specTexts.slice(0, 10),
            intent: 'Spec 문서에 명시된 UI 텍스트와 Figma 디자인 간 일관성 확인',
            expected: figmaText,
            scope: figmaNode.path || '전체',
            candidates: top3Candidates,
            specItem: bestMatch?.item,
          },
          relatedSpecId: figmaNode.uid,
          meta: {
            ...specMeta,
            ruleName: 'reverse.comparison',
            ruleReason: `Figma의 "${figmaText}"가 Spec에 언급되지 않음`,
            recommendedAction,
          },
          specSideEvidence: {
            spec_section: bestMatch?.item.meta?.section,
            spec_row: bestMatch?.item.meta?.row,
            spec_feature: bestMatch?.item.meta?.feature,
            spec_text: bestMatch?.item.text,
            spec_items_count: specItemsCount,
            spec_fulltext_hits: specFulltextHits,
          },
          figmaSideEvidence: {
            figma_text: figmaText,
            figma_page: figmaNode.meta?.page,
            figma_frame_path: figmaNode.path,
            figma_layer_name: figmaNode.name,
            figma_text_style: figmaNode.meta?.style ? {
              fontSize: figmaNode.meta.style.fontSize,
              color: figmaNode.meta.style.color,
              fontWeight: figmaNode.meta.style.fontWeight,
            } : undefined,
          },
          matchingEvidence: {
            match_candidates: top3Candidates,
          },
          decisionMetadata: {
            rule_name: 'reverse.comparison',
            decision_reason_code: decisionReasonCode,
            decision_explanation: decisionExplanation,
          },
          diffType: 'EXTRA',
        });
      }
    }

    return findings;
  },
};

export const defaultRules: DiffRule[] = [
  keyedDiffRule, // Phase-2: selectorKey 기반 1:1 매핑 (최우선)
  textStrictRule, // Phase-2: UNMAPPED fallback (selectorKey 없는 항목만)
  reverseComparisonRule, // Phase-2: selectorKey 없는 Figma 노드만, severity 낮춤
  missingElementRule,
  visibilityRule,
  policyRule,
  structureRule,
];







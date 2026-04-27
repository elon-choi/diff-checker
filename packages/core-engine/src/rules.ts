import { DiffFinding, SpecItem, UUMDocument, UUMNode } from './types';
import { DiffRule } from './diff-engine';
import { LLMAdapter } from '../../../adapters/llm-adapter/src/index';

function normalizeText(value?: string): string {
  return (value ?? '')
    .toString()
    .trim()
    .replace(/^[\s\p{P}\p{S}]+(?=\p{L})/u, '') // 줄 앞 서식 기호 제거 (•, -, ① 등)
    .replace(/제\s+(\d+)\s+조/g, '제$1조')       // 조항 번호 공백 정규화
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
          // selectorKey로 매칭 실패 시 텍스트 기반 매칭 시도
          let textMatchFound = false;
          let bestTextMatch: { node: UUMNode; similarity: number } | null = null;
          
          for (const node of webDoc.nodes) {
            const nodeText = [node.text, node.name].filter(Boolean).join(' ');
            if (!nodeText) continue;
            
            // 정확한 텍스트 매칭
            const normalizedSpec = normalizeText(specText);
            const normalizedNode = normalizeText(nodeText);
            if (normalizedSpec === normalizedNode) {
              textMatchFound = true;
              break;
            }
            
            // 유사도 기반 매칭 (임계값 0.7)
            const similarity = calculateTextSimilarity(specText, nodeText);
            if (similarity > 0.7) {
              if (!bestTextMatch || similarity > bestTextMatch.similarity) {
                bestTextMatch = { node, similarity };
                textMatchFound = true;
              }
            }
          }
          
          if (!textMatchFound) {
            // selectorKey도 없고 텍스트 매칭도 실패
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
                ruleReason: `selectorKey "${selectorKey}"로 매핑된 Web 노드가 없고, 텍스트 매칭도 실패함`,
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
                decision_explanation: `Spec에 정의된 selectorKey "${selectorKey}"에 해당하는 Web 노드가 없고, 텍스트 "${specText}"도 Web에서 찾을 수 없습니다.`,
              },
            });
          } else if (bestTextMatch && bestTextMatch.similarity < 0.9) {
            // 텍스트 매칭은 성공했지만 유사도가 낮음
            const webText = bestTextMatch.node.text || bestTextMatch.node.name || '';
            findings.push({
              id: `keyed.changed.web:${specItem.id}`,
              severity: bestTextMatch.similarity < 0.7 ? 'MAJOR' : 'MINOR',
              category: 'TEXT_MISMATCH',
              description: `Spec 요구사항 "${specText}" (Key: ${selectorKey})가 Web에서 "${webText}"로 변경됨 (유사도: ${(bestTextMatch.similarity * 100).toFixed(0)}%)`,
              evidence: {
                expected: specText,
                found: webText,
                selectorKey,
                similarity: bestTextMatch.similarity,
                specItem,
                webNode: bestTextMatch.node,
                platform: 'WEB',
              },
              relatedSpecId: specItem.id,
              selectorKey,
              diffType: 'CHANGED',
              requirement: specItem.sectionPath,
              meta: {
                ...specItem.meta,
                ruleName: 'keyed.diff',
                ruleReason: `selectorKey "${selectorKey}"로 매핑된 Web 노드가 없지만, 텍스트 유사도 매칭으로 "${webText}"를 찾음 (유사도: ${(bestTextMatch.similarity * 100).toFixed(0)}%)`,
                recommendedAction: bestTextMatch.similarity < 0.7 ? 'design-update' as const : 'spec-update' as const,
              },
              specSideEvidence: {
                spec_section: specItem.meta?.section,
                spec_row: specItem.meta?.row,
                spec_feature: specItem.meta?.feature,
                spec_text: specText,
                spec_items_count: specItemsCount,
              },
              webSideEvidence: {
                web_text: webText,
                web_path: bestTextMatch.node.path,
                web_selector: bestTextMatch.node.selector,
              },
              decisionMetadata: {
                rule_name: 'keyed.diff',
                decision_reason_code: 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL',
                decision_explanation: `selectorKey "${selectorKey}"로 매핑된 Web 노드가 없지만, 텍스트 유사도 매칭으로 "${webText}"를 찾았습니다. (유사도: ${(bestTextMatch.similarity * 100).toFixed(0)}%)`,
              },
            });
          }
          // bestTextMatch.similarity >= 0.9이면 매칭 성공으로 간주하고 finding 생성 안 함
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

    // 디버깅: 플랫폼별 문서 존재 여부 확인
    const webDoc = docs.find((d) => d.platform === 'WEB');
    const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
    const androidDoc = docs.find((d) => d.platform === 'ANDROID');
    const iosDoc = docs.find((d) => d.platform === 'IOS');
    
    // 각 플랫폼별로 매칭 확인할 문서 목록
    // 문서가 존재하고 노드가 있어야 체크 대상에 포함
    const platformsToCheck: Array<{ doc: UUMDocument | undefined; platform: string }> = [
      { doc: webDoc, platform: 'WEB' },
      { doc: figmaDoc, platform: 'FIGMA' },
      { doc: androidDoc, platform: 'ANDROID' },
      { doc: iosDoc, platform: 'IOS' },
    ].filter(({ doc }) => doc !== undefined && doc.nodes.length > 0);
    
    console.log('[DEBUG] textStrictRule 실행:', {
      unmappedSpecItemsCount: unmappedSpecItems.length,
      webDocExists: !!webDoc,
      webDocNodesCount: webDoc?.nodes.length || 0,
      webDocSampleTexts: webDoc?.nodes.slice(0, 5).map(n => n.text || n.name).filter(Boolean) || [],
      figmaDocExists: !!figmaDoc,
      androidDocExists: !!androidDoc,
      iosDocExists: !!iosDoc,
      platformsToCheck: platformsToCheck.map(p => p.platform),
      unmappedSpecItemsSample: unmappedSpecItems.slice(0, 5).map(item => ({
        id: item.id,
        text: item.text?.substring(0, 50),
        selectorKey: item.selectorKey,
      })),
    });

    for (const item of unmappedSpecItems) {
      if (!item.text) continue;
      const expected = item.text.trim();
      const expectedNorm = normalizeText(expected);
      
      console.log('[DEBUG] textStrictRule - SpecItem 처리 시작:', {
        id: item.id,
        text: expected.substring(0, 50),
        platformsToCheck: platformsToCheck.map(p => p.platform),
      });

      let hasMatch = false;
      let bestMatch: { node: UUMNode; platform: string; similarity: number } | null = null;

      for (const { doc, platform } of platformsToCheck) {
        if (!doc) continue;
        
        // 정확한 텍스트 매칭 확인
        const exactMatch = doc.nodes.find((node) => {
          const nodeText = normalizeText(node.text || node.name || '');
          return nodeText === expectedNorm && nodeText.length > 0;
        });

        if (exactMatch) {
          hasMatch = true;
          break;
        }

        // 짧은 텍스트(10자 미만)의 경우 단순 포함 확인
        // 예: "탈퇴"가 "카카오웹툰 탈퇴하기"에 포함되어 있는지 확인
        if (expectedNorm.length < 10) {
          const shortTextMatch = doc.nodes.find((node) => {
            const nodeText = normalizeText(node.text || node.name || '');
            // Spec 텍스트가 Web 텍스트에 포함되어 있는지 확인
            if (nodeText.includes(expectedNorm)) {
              // 짧은 텍스트의 경우 문맥 검증을 완화
              // 앞뒤 중 하나라도 공백이나 문장 부호가 있으면 매칭으로 인정
              const index = nodeText.indexOf(expectedNorm);
              const before = nodeText.substring(Math.max(0, index - 5), index);
              const after = nodeText.substring(index + expectedNorm.length, index + expectedNorm.length + 5);
              // 앞이 문장 시작이거나 공백/문장부호로 끝나면 OK
              // 또는 뒤가 문장 끝이거나 공백/문장부호로 시작하면 OK
              const isValidContext = (before === '' || /[\s.,!?]/.test(before[before.length - 1])) ||
                                    (after === '' || /[\s.,!?]/.test(after[0]));
              return isValidContext;
            }
            return false;
          });

          if (shortTextMatch) {
            console.log('[DEBUG] textStrictRule - 짧은 텍스트 매칭 성공:', {
              specText: expected.substring(0, 50),
              platform,
              matched: true,
            });
            hasMatch = true;
            break;
          }
        }

        // 부분 문자열 포함 확인 (매우 엄격한 조건)
        // Web DOM의 텍스트가 합쳐져 있을 수 있지만, 실제로는 다른 텍스트인데 부분 문자열이 포함될 수 있으므로 매우 엄격하게 검사
        const partialMatch = doc.nodes.find((node) => {
          const nodeText = normalizeText(node.text || node.name || '');
          
          // Spec 텍스트가 Web 텍스트에 포함되어 있는지 확인
          // 조건: Spec 텍스트가 10자 이상이고, Web 텍스트가 Spec 텍스트보다 충분히 길어야 함
          if (expectedNorm.length >= 10 && nodeText.length >= expectedNorm.length * 0.8) {
            // 핵심 키워드 추출 (2자 이상의 단어만)
            const specWords = expectedNorm.split(' ').filter(w => w.length > 2);
            const nodeWords = nodeText.split(' ').filter(w => w.length > 2);
            
            // 핵심 키워드의 100% 매칭 필요 (모든 핵심 키워드가 포함되어야 함)
            const matchedWords = specWords.filter(word => nodeWords.includes(word));
            const keywordsMatch = specWords.length === 0 || matchedWords.length === specWords.length;
            // 전체 포함 확인: 한국어는 단어 경계가 없으므로 순수 포함만 확인
            if (keywordsMatch && nodeText.includes(expectedNorm)) {
              return true;
            }
          }
          return false;
        });

        if (partialMatch) {
          console.log('[DEBUG] textStrictRule - 부분 문자열 매칭 성공:', {
            specText: expected.substring(0, 50),
            platform,
            matched: true,
          });
          hasMatch = true;
          break;
        }

        // 유사도 기반 매칭 (매우 엄격한 조건)
        // 실제로는 다른 텍스트인데 매칭되는 것을 방지하기 위해 매우 엄격한 검증 필요
        for (const node of doc.nodes) {
          const nodeText = [node.text, node.name].filter(Boolean).join(' ');
          if (!nodeText) continue;

          const nodeTextNorm = normalizeText(nodeText);
          const similarity = calculateTextSimilarity(expected, nodeText);
          
          // 핵심 키워드 추출 (2자 이상의 단어만)
          const expectedWords = expectedNorm.split(' ').filter(w => w.length > 2);
          const nodeWords = nodeTextNorm.split(' ').filter(w => w.length > 2);
          
          // 핵심 키워드가 모두 포함되어 있는지 확인 (100% 매칭 필요)
          const matchedKeywords = expectedWords.filter(word => nodeWords.includes(word));
          const keywordMatchRatio = expectedWords.length > 0 ? matchedKeywords.length / expectedWords.length : 0;
          
          // 텍스트 길이 비율 계산
          const lengthRatio = expectedNorm.length > 0 
            ? Math.min(expectedNorm.length, nodeTextNorm.length) / Math.max(expectedNorm.length, nodeTextNorm.length)
            : 0;
          
          // 매우 엄격한 조건:
          // 1. 유사도가 0.85 이상 (0.7에서 상향)
          // 2. 핵심 키워드의 100% 매칭 (80%에서 상향) - 모든 핵심 키워드가 포함되어야 함
          // 3. 길이 비율이 0.8 이상 (0.7에서 상향) - 텍스트 길이가 비슷해야 함
          // 4. Spec 텍스트가 Web 텍스트에 포함되거나, Web 텍스트가 Spec 텍스트에 포함되어야 함
          const isSubstringMatch = nodeTextNorm.includes(expectedNorm) || expectedNorm.includes(nodeTextNorm);
          
          if (similarity >= 0.85 && keywordMatchRatio >= 1.0 && lengthRatio >= 0.8 && isSubstringMatch) {
            if (!bestMatch || similarity > bestMatch.similarity) {
              bestMatch = { node, platform, similarity };
              hasMatch = true;
            }
          } else {
            // 매칭 실패 로그
            console.log('[DEBUG] textStrictRule - 유사도 매칭 실패:', {
              specText: expected.substring(0, 50),
              nodeText: nodeText.substring(0, 50),
              similarity: similarity.toFixed(2),
              keywordMatchRatio: keywordMatchRatio.toFixed(2),
              lengthRatio: lengthRatio.toFixed(2),
              isSubstringMatch,
              expectedWords,
              matchedKeywords,
            });
          }
        }
      }

      // UI 타입 단어 제거 후 재시도
      if (!hasMatch) {
        const strippedText = stripUiTypeWords(expected);
        if (strippedText && strippedText !== expected && strippedText.length >= 2) {
          const strippedNorm = normalizeText(strippedText);
          
          for (const { doc, platform } of platformsToCheck) {
            if (!doc) continue;

            const exactMatch = doc.nodes.find((node) => {
              const nodeText = normalizeText(node.text || node.name || '');
              return nodeText === strippedNorm && nodeText.length > 0;
            });

            if (exactMatch) {
              hasMatch = true;
              break;
            }

            // 부분 문자열 포함 확인 (매우 엄격한 매칭)
            const partialMatch = doc.nodes.find((node) => {
              const nodeText = normalizeText(node.text || node.name || '');
              if (strippedNorm.length >= 10 && nodeText.length >= strippedNorm.length * 0.8) {
                // 핵심 키워드 추출 (2자 이상의 단어만)
                const specWords = strippedNorm.split(' ').filter(w => w.length > 2);
                const nodeWords = nodeText.split(' ').filter(w => w.length > 2);
                
                // 핵심 키워드의 100% 매칭 필요 (모든 핵심 키워드가 포함되어야 함)
                const matchedWords = specWords.filter(word => nodeWords.includes(word));
                const keywordsMatch = specWords.length === 0 || matchedWords.length === specWords.length;
                // 전체 포함 확인: 한국어는 단어 경계가 없으므로 순수 포함만 확인
                if (keywordsMatch && nodeText.includes(strippedNorm)) {
                  return true;
                }
              }
              return false;
            });

            if (partialMatch) {
              hasMatch = true;
              break;
            }

            for (const node of doc.nodes) {
              const nodeText = [node.text, node.name].filter(Boolean).join(' ');
              if (!nodeText) continue;

              const nodeTextNorm = normalizeText(nodeText);
              const similarity = calculateTextSimilarity(strippedText, nodeText);
              
              // 핵심 키워드 추출 및 매칭 확인
              const strippedWords = strippedNorm.split(' ').filter(w => w.length > 2);
              const nodeWords = nodeTextNorm.split(' ').filter(w => w.length > 2);
              const matchedKeywords = strippedWords.filter(word => nodeWords.includes(word));
              const keywordMatchRatio = strippedWords.length > 0 ? matchedKeywords.length / strippedWords.length : 0;
              
              // 길이 비율 계산
              const lengthRatio = strippedNorm.length > 0
                ? Math.min(strippedNorm.length, nodeTextNorm.length) / Math.max(strippedNorm.length, nodeTextNorm.length)
                : 0;
              
              // 부분 문자열 매칭 확인
              const isSubstringMatch = nodeTextNorm.includes(strippedNorm) || strippedNorm.includes(nodeTextNorm);
              
              // 매우 엄격한 조건: 유사도 0.85 이상, 키워드 100% 매칭, 길이 비율 0.8 이상, 부분 문자열 매칭
              if (similarity >= 0.85 && keywordMatchRatio >= 1.0 && lengthRatio >= 0.8 && isSubstringMatch) {
                hasMatch = true;
                break;
              }
            }
            if (hasMatch) break;
          }
        }
      }

      console.log('[DEBUG] textStrictRule - 매칭 결과:', {
        specText: expected.substring(0, 50),
        hasMatch,
        bestMatch: bestMatch ? {
          platform: bestMatch.platform,
          similarity: bestMatch.similarity,
          text: (bestMatch.node.text || bestMatch.node.name)?.substring(0, 50),
        } : null,
      });

      if (!hasMatch) {
        const specFulltextHits = countSpecFulltextHits(expected);
        let decisionReasonCode: 'SPEC_CONFIRMED_MISSING' | 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL' = 'SPEC_CONFIRMED_MISSING';
        let decisionExplanation = '';

        // 플랫폼별로 매칭 실패 여부 확인
        // hasMatch가 false라는 것은 platformsToCheck에 포함된 모든 플랫폼에서 매칭에 실패했다는 의미
        // 따라서 platformsToCheck에 포함된 플랫폼을 모두 missingPlatforms에 추가
        const missingPlatforms: string[] = [];
        
        // platformsToCheck에 포함된 플랫폼은 모두 매칭 실패 (hasMatch가 false이므로)
        for (const { platform } of platformsToCheck) {
          missingPlatforms.push(platform);
        }
        
        // platformsToCheck에 포함되지 않은 플랫폼 (노드가 비어있는 경우)도 추가
        if (webDoc && webDoc.nodes.length === 0) {
          missingPlatforms.push('WEB');
        }
        if (figmaDoc && figmaDoc.nodes.length === 0) {
          missingPlatforms.push('FIGMA');
        }
        if (androidDoc && androidDoc.nodes.length === 0) {
          missingPlatforms.push('ANDROID');
        }
        if (iosDoc && iosDoc.nodes.length === 0) {
          missingPlatforms.push('IOS');
        }

        if (specFulltextHits > 0) {
          decisionReasonCode = 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL';
          decisionExplanation = `Spec 전체 텍스트에서 "${expected}"가 ${specFulltextHits}번 발견되었지만 정규화 과정에서 매칭에 실패했습니다.`;
        } else {
          decisionReasonCode = 'SPEC_CONFIRMED_MISSING';
          decisionExplanation = `Spec에 정의된 텍스트 "${expected}"가 ${missingPlatforms.length > 0 ? missingPlatforms.join('/') : platformsToCheck.map(p => p.platform).join('/')}에 존재하지 않습니다.`;
        }

        // Web 문서에서 해당 텍스트를 포함하는 노드 찾기 (디버깅용)
        const webNodesContainingText = webDoc ? webDoc.nodes.filter(node => {
          const nodeText = normalizeText(node.text || node.name || '');
          return nodeText.includes(expectedNorm) && nodeText.length > expectedNorm.length;
        }).slice(0, 3) : [];

        console.log('[DEBUG] textStrictRule - finding 생성:', {
          specText: expected.substring(0, 50),
          platformsChecked: platformsToCheck.map(p => p.platform),
          missingPlatforms,
          webDocNodesCount: webDoc?.nodes.length || 0,
          webNodesContainingText: webNodesContainingText.map(n => ({
            text: (n.text || n.name)?.substring(0, 100),
            path: n.path,
          })),
        });

        findings.push({
          id: `text.strict:${item.id}`,
          severity: 'MAJOR',
          category: 'TEXT_MISMATCH',
          description: missingPlatforms.length > 0 
            ? `스펙 텍스트가 ${missingPlatforms.join('/')}에 미존재: "${expected}"`
            : `스펙 텍스트가 미존재: "${expected}"`,
          evidence: {
            expected,
            checkedDocs: platformsToCheck.map((p) => p.platform),
            missingPlatforms: missingPlatforms.length > 0 ? missingPlatforms : undefined,
            matchType: null,
            specItem: item,
          },
          relatedSpecId: item.id,
          meta: {
            ...item.meta,
            ruleName: 'text.strict',
            ruleReason: missingPlatforms.length > 0
              ? `Spec에 정의된 텍스트 "${expected}"가 ${missingPlatforms.join('/')}에 존재하지 않음`
              : `Spec에 정의된 텍스트 "${expected}"가 ${platformsToCheck.map(p => p.platform).join('/')}에 존재하지 않음`,
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
      } else if (bestMatch && bestMatch.similarity < 0.9) {
        // 유사도 매칭이지만 완전히 일치하지 않는 경우
        const foundText = bestMatch.node.text || bestMatch.node.name || '';
        const specFulltextHits = countSpecFulltextHits(expected);
        
        findings.push({
          id: `text.strict:${item.id}`,
          severity: bestMatch.similarity < 0.7 ? 'MAJOR' : 'MINOR',
          category: 'TEXT_MISMATCH',
          description: `스펙 텍스트 유사도 낮음 (${(bestMatch.similarity * 100).toFixed(0)}%): "${expected}" vs "${foundText}"`,
          evidence: {
            expected,
            found: foundText,
            similarity: bestMatch.similarity,
            matchType: 'similarity',
            specItem: item,
            platform: bestMatch.platform,
          },
          relatedSpecId: item.id,
          meta: {
            ...item.meta,
            ruleName: 'text.strict',
            ruleReason: `Spec 텍스트 "${expected}"와 ${bestMatch.platform}의 "${foundText}"의 유사도가 낮음 (${(bestMatch.similarity * 100).toFixed(0)}%)`,
            recommendedAction: bestMatch.similarity < 0.7 ? 'design-update' as const : 'spec-update' as const,
          },
          specSideEvidence: {
            spec_section: item.meta?.section,
            spec_row: item.meta?.row,
            spec_feature: item.meta?.feature,
            spec_text: expected,
            spec_items_count: specItemsCount,
            spec_fulltext_hits: specFulltextHits,
          },
          figmaSideEvidence: bestMatch.platform === 'FIGMA' ? {
            figma_text: foundText,
            figma_page: bestMatch.node.meta?.page,
            figma_frame_path: bestMatch.node.path,
            figma_layer_name: bestMatch.node.name,
          } : undefined,
          webSideEvidence: bestMatch.platform === 'WEB' ? {
            web_text: foundText,
            web_path: bestMatch.node.path,
            web_selector: bestMatch.node.selector,
          } : undefined,
          matchingEvidence: {
            match_candidates: [{
              text: foundText,
              section: item.meta?.section,
              row: item.meta?.row,
              similarity: bestMatch.similarity,
              platform: bestMatch.platform,
            }],
          },
          decisionMetadata: {
            rule_name: 'text.strict',
            decision_reason_code: 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL',
            decision_explanation: `Spec 텍스트 "${expected}"와 ${bestMatch.platform}의 "${foundText}"의 유사도가 낮아 정규화 과정에서 매칭에 실패했습니다. (유사도: ${(bestMatch.similarity * 100).toFixed(0)}%)`,
          },
          diffType: 'UNMAPPED',
          requirement: item.sectionPath,
        });
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
      // 루트 노드 감지: DOCUMENT role, /0로 끝나는 path, /root 포함, 또는 /html/body (Web DOM)
      const hasRoot = d.nodes.some((n) => 
        n.role === 'DOCUMENT' || 
        n.path?.endsWith('/0') || 
        n.path?.includes('/root') ||
        n.path === '/html/body' ||
        (d.platform === 'WEB' && n.path?.startsWith('/html/body'))
      );
      if (!hasRoot) {
        findings.push({
          id: `structure:root-missing:${d.platform}`,
          severity: 'INFO',
          category: 'STRUCTURE',
          description: `${d.platform} 문서에 루트 추정 노드가 없음`,
          evidence: { firstNodes: d.nodes.slice(0, 3), platform: d.platform },
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
      
      // 특수 문자만 있는 텍스트 제외 (예: "·", "-", ".", "•" 등)
      const trimmedText = figmaText.trim();
      if (trimmedText.length <= 2 && /^[·•\-\.,;:!?()\[\]{}'"`~@#$%^&*+=|\\/<>_]+$/.test(trimmedText)) {
        continue;
      }
      
      // 숫자만 있는 텍스트 제외 (예: "320", "2025" 등)
      if (/^\d+$/.test(trimmedText)) {
        continue;
      }
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
        const isResolutionLabel = /(^\d{3,4}\s*해상도$)|(\b해상도\b)|(^\d{3,4}\s*px$)|(^\d{3,4}\s*resolution$)/i.test(normalizedFigmaText);
        
        // "Last Update" 같은 메타데이터 제외
        const isMetadataLabel = /^(last\s*update|업데이트|update\s*date|날짜|date|버전|version)/i.test(normalizedFigmaText);
        
        // 상태 라벨 제외 (예: "비활성화", "활성화", "미노출", "노출" 등)
        const isStateLabel = /(비활성화|활성화|미노출|노출|비활성|활성|disabled|enabled|hidden|visible)$/i.test(normalizedFigmaText);

        // CONTENT_TEXT 체크 (작가명, 해시태그, 작품명 등)
        const contentKeywords = ['작가', '작품', '해시태그', '태그', 'author', 'hashtag', 'tag', '작품명'];
        const isContentText = contentKeywords.some(keyword => 
          normalizedFigmaText.includes(keyword.toLowerCase())
        );

        // 메타데이터/상태 라벨은 finding 생성하지 않음 (continue로 건너뛰기)
        if (isResolutionLabel || isMetadataLabel || isStateLabel) {
          continue; // finding 생성하지 않고 다음 노드로
        }
        
        if (isAnnotation) {
          decisionReasonCode = 'FIGMA_ANNOTATION_SUSPECT';
          decisionExplanation = `Figma 텍스트 "${figmaText}"는 툴팁/설명 등 주석성 텍스트로 보입니다.`;
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
        } else if (decisionReasonCode === 'FIGMA_ANNOTATION_SUSPECT' || decisionReasonCode === 'CONTENT_TEXT' || isMetadataLabel || isStateLabel) {
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







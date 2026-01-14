import { DiffFinding, UUMDocument, SpecItem, UUMNode } from '../../../core-engine/src/types';

type LLMProvider = 'openai' | 'anthropic' | 'google' | 'none';

interface LLMConfig {
  provider?: LLMProvider;
  apiKey?: string;
  model?: string;
  enabled?: boolean;
}

function normalizeText(text?: string): string {
  return (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function areFindingsSimilar(f1: DiffFinding, f2: DiffFinding): boolean {
  const desc1 = normalizeText(f1.description);
  const desc2 = normalizeText(f2.description);
  
  if (desc1 === desc2) return true;
  
  const words1 = new Set(desc1.split(' ').filter(Boolean));
  const words2 = new Set(desc2.split(' ').filter(Boolean));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  const similarity = union > 0 ? intersection / union : 0;
  
  return similarity > 0.7 && f1.category === f2.category && f1.severity === f2.severity;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that analyzes UI/UX specification differences. Respond in JSON format only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('OpenAI API 호출 실패:', error);
    throw error;
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-haiku-20240307',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  } catch (error) {
    console.error('Anthropic API 호출 실패:', error);
    throw error;
  }
}

async function refineWithLLMDiff(
  findings: DiffFinding[],
  docs: UUMDocument[],
  specItems: SpecItem[],
  config: LLMConfig
): Promise<DiffFinding[]> {
  const figmaDoc = docs.find((d) => d.platform === 'FIGMA');
  if (!figmaDoc) return findings;

  // 불확실한 finding만 필터링 (유사도가 낮거나 MISMATCH인 경우)
  const uncertainFindings = findings.filter((f) => {
    const matchType = (f as any).matchType;
    const similarity = (f.evidence as any)?.similarity;
    const ruleName = (f.meta as any)?.ruleName;
    
    // 규칙 기반에서 MISMATCH로 판단된 항목 또는 유사도가 낮은 항목
    return (
      f.category === 'TEXT_MISMATCH' &&
      (similarity === undefined || similarity < 0.8) &&
      ruleName !== 'reverse.comparison' &&
      !(f as any).selectorKey // selectorKey가 있는 항목은 keyedDiffRule에서 처리했으므로 제외
    );
  });

  if (uncertainFindings.length === 0) return findings;

  console.log(`[LLM Diff] 불확실한 finding ${uncertainFindings.length}개 재검증 시작...`);

  const refinedFindings: DiffFinding[] = [];
  const processedIds = new Set<string>();

  // 불확실한 finding을 LLM으로 재검증
  for (const finding of uncertainFindings) {
    const specItemId = finding.relatedSpecId;
    if (!specItemId) continue;

    const specItem = specItems.find((item) => item.id === specItemId);
    if (!specItem || !specItem.text) continue;

    // Figma 노드 찾기
    const figmaText = (finding.evidence as any)?.figmaText || 
                      (finding.figmaSideEvidence as any)?.figma_text || '';
    
    if (!figmaText) continue;

    const figmaNode = figmaDoc.nodes.find(
      (node) => node.text === figmaText || node.name === figmaText
    );

    if (!figmaNode) continue;

    try {
      const llmResult = await LLMAdapter.compareSpecWithFigma(
        specItem,
        figmaNode,
        specItem.sectionPath
      );

      // LLM 결과에 따라 finding 업데이트
      if (llmResult.match && llmResult.matchType === 'SEMANTIC' && llmResult.confidence >= 0.7) {
        // 의미적으로 동일하다고 판단되면 finding 제거 또는 severity 낮춤
        processedIds.add(finding.id);
        if (llmResult.severity === 'NONE' || llmResult.severity === 'INFO') {
          // finding 제거 (차이가 없다고 판단)
          continue;
        } else {
          // severity만 조정
          refinedFindings.push({
            ...finding,
            severity: llmResult.severity === 'MINOR' ? 'MINOR' : finding.severity,
            diffType: finding.diffType || (finding.category === 'MISSING_ELEMENT' ? 'MISSING' : 
                                           finding.category === 'TEXT_MISMATCH' ? 'MISMATCH' : 'UNMAPPED'),
            description: `${finding.description} (LLM 재검증: ${llmResult.reason})`,
            decisionMetadata: {
              ...finding.decisionMetadata,
              decision_explanation: `LLM 재검증: ${llmResult.reason}`,
            },
          });
        }
      } else {
        // LLM도 차이가 있다고 판단하면 그대로 유지하되 설명 추가
        processedIds.add(finding.id);
        refinedFindings.push({
          ...finding,
          severity: llmResult.severity !== 'NONE' ? llmResult.severity : finding.severity,
          diffType: finding.diffType || (finding.category === 'MISSING_ELEMENT' ? 'MISSING' : 
                                       finding.category === 'TEXT_MISMATCH' ? 'MISMATCH' : 'UNMAPPED'),
          description: `${finding.description} (LLM 재검증: ${llmResult.reason})`,
          decisionMetadata: {
            ...finding.decisionMetadata,
            decision_explanation: `LLM 재검증: ${llmResult.reason}`,
          },
        });
      }
    } catch (error) {
      console.warn(`LLM diff 재검증 실패 (${finding.id}):`, error);
      // 실패 시 원본 finding 유지
      refinedFindings.push(finding);
      processedIds.add(finding.id);
    }
  }

  // 처리되지 않은 finding은 그대로 유지
  const remainingFindings = findings.filter((f) => !processedIds.has(f.id));
  
  console.log(`[LLM Diff] 재검증 완료: ${refinedFindings.length}개 업데이트, ${remainingFindings.length}개 유지`);

  return [...refinedFindings, ...remainingFindings];
}

async function refineWithLLM(
  findings: DiffFinding[],
  docs: UUMDocument[],
  specItems: SpecItem[],
  config: LLMConfig
): Promise<DiffFinding[]> {
  if (!config.enabled || !config.apiKey || config.provider === 'none') {
    return findings;
  }

  const prompt = `다음은 UI/UX 스펙 차이점 분석 결과입니다. 다음 작업을 수행해주세요:

1. 의미적으로 동일하거나 유사한 findings를 병합하세요.
2. 각 finding의 설명을 더 명확하고 구체적으로 개선하세요.
3. 중복되거나 불필요한 findings를 제거하세요.

Findings:
${JSON.stringify(findings.slice(0, 20), null, 2)}

응답은 다음 JSON 형식으로 반환해주세요:
{
  "findings": [
    {
      "id": "string",
      "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO",
      "category": "TEXT_MISMATCH" | "MISSING_ELEMENT" | "VISIBILITY" | "POLICY" | "STRUCTURE",
      "description": "string",
      "evidence": {},
      "relatedSpecId": "string (optional)"
    }
  ]
}`;

  try {
    let responseText: string;
    
    if (config.provider === 'openai') {
      responseText = await callOpenAI(config.apiKey, config.model || 'gpt-4o-mini', prompt);
    } else if (config.provider === 'anthropic') {
      responseText = await callAnthropic(config.apiKey, config.model || 'claude-3-haiku-20240307', prompt);
    } else {
      return findings;
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.findings && Array.isArray(parsed.findings)) {
        return parsed.findings.map((f: any) => ({
          ...f,
          evidence: f.evidence || {},
        })) as DiffFinding[];
      }
    }
  } catch (error) {
    console.error('LLM 후처리 실패, 원본 findings 반환:', error);
  }

  return findings;
}

function mergeSimilarFindings(findings: DiffFinding[]): DiffFinding[] {
  const merged: DiffFinding[] = [];
  const used = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (used.has(i)) continue;

    let mergedFinding = { ...findings[i] };
    const similarIndices: number[] = [i];

    for (let j = i + 1; j < findings.length; j++) {
      if (used.has(j)) continue;
      if (areFindingsSimilar(findings[i], findings[j])) {
        similarIndices.push(j);
        used.add(j);
        
        if (findings[j].severity === 'CRITICAL' && mergedFinding.severity !== 'CRITICAL') {
          mergedFinding.severity = 'CRITICAL';
        }
        
        const desc1 = mergedFinding.description;
        const desc2 = findings[j].description;
        if (desc2.length > desc1.length) {
          mergedFinding.description = desc2;
        }
      }
    }

    if (similarIndices.length > 1) {
      mergedFinding.description = `[병합됨: ${similarIndices.length}건] ${mergedFinding.description}`;
    }

    merged.push(mergedFinding);
    used.add(i);
  }

  return merged;
}

async function validateSpecItemWithLLM(
  item: SpecItem,
  context: string,
  config: LLMConfig
): Promise<{ isValid: boolean; confidence: number; reason: string }> {
  if (!config.enabled || !config.apiKey || config.provider === 'none') {
    return { isValid: true, confidence: 1.0, reason: 'LLM 비활성화됨' };
  }

  const prompt = `다음 텍스트가 실제 UI 화면에 표시되는 텍스트인지 판단해주세요.

텍스트: "${item.text}"
컨텍스트: ${context}
출처: ${item.meta?.source || 'unknown'}
섹션: ${item.meta?.section || 'unknown'}
컬럼: ${item.meta?.column || 'unknown'}

**판단 기준:**

1. **유효함 (실제 UI 텍스트)**:
   - 사용자가 화면에서 직접 보는 텍스트
   - 버튼명: "확인", "취소", "삭제하기"
   - 라벨/옵션명: "인기순", "최신순", "전체"
   - 안내 문구: "탈퇴 시 보유한 이용권과 잔여 캐시는 모두 소멸됩니다"
   - 필드명: "이름", "이메일", "비밀번호"

2. **무효함 (메타데이터 또는 내부 식별자)**:
   - **UI 요소 타입**: "Text", "Button", "Check Box", "Input", "Select", "Filter", "Label" 등
     → 요구사항 표의 "속성" 컬럼에 있는 값으로, 실제 화면에 표시되지 않는 메타데이터
   - **번역키**: "more_myinfo_account_delete_..." (언더스코어로 구분된 긴 문자열)
   - **내부 식별자**: Jira 티켓 번호, 날짜, 버전 번호 등
   - **설명 문구**: "11/4 업데이트", "참고: ...", "비고: ..."
   - **표 구조 정보**: "구분", "항목", "속성", "내용" (표 헤더 자체)

**특히 주의할 사항:**
- "속성" 컬럼에서 추출된 텍스트는 대부분 UI 요소 타입이므로 무효함
- "Text", "Button", "Check Box", "Radio", "Input" 등은 실제 화면에 표시되지 않음
- 이런 값들은 디자인 파일(Figma)에서 찾을 수 없고, 찾을 필요도 없음

**응답 형식 (JSON만 반환, 다른 설명 없이):**
{
  "isValid": true/false,
  "confidence": 0.0-1.0,
  "reason": "판단 이유 (특히 UI 요소 타입인 경우 명시적으로 언급)"
}`;

  try {
    let responseText: string;
    
    if (config.provider === 'openai') {
      responseText = await callOpenAI(config.apiKey, config.model || 'gpt-4o-mini', prompt);
    } else if (config.provider === 'anthropic') {
      responseText = await callAnthropic(config.apiKey, config.model || 'claude-3-haiku-20240307', prompt);
    } else {
      return { isValid: true, confidence: 1.0, reason: 'LLM Provider 없음' };
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isValid: parsed.isValid === true,
        confidence: parsed.confidence || 0.5,
        reason: parsed.reason || 'LLM 판단',
      };
    }
  } catch (error) {
    console.warn(`LLM 검증 실패 (${item.text}):`, error);
  }

  return { isValid: true, confidence: 0.5, reason: 'LLM 검증 실패, 기본값 사용' };
}

export const LLMAdapter = {
  async refine(
    findings: DiffFinding[],
    docs: UUMDocument[],
    specItems: SpecItem[]
  ): Promise<DiffFinding[]> {
    const provider = (process.env.LLM_PROVIDER || 'none') as LLMProvider;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    const enabled = process.env.LLM_ENABLED === 'true';
    const diffEnabled = process.env.LLM_DIFF_ENABLED === 'true';

    const config: LLMConfig = {
      provider: provider !== 'none' ? provider : undefined,
      apiKey,
      model,
      enabled: enabled && !!apiKey,
    };

    if (!config.enabled) {
      return mergeSimilarFindings(findings);
    }

    // LLM diff 비교 수행 (불확실한 finding만 재검증)
    if (diffEnabled) {
      try {
        const refinedFindings = await refineWithLLMDiff(findings, docs, specItems, config);
        return refinedFindings;
      } catch (error) {
        console.warn('LLM diff 비교 실패, 기본 refine 사용:', error);
      }
    }

    try {
      return await refineWithLLM(findings, docs, specItems, config);
    } catch (error) {
      console.warn('LLM 후처리 실패, 기본 병합 로직 사용:', error);
      return mergeSimilarFindings(findings);
    }
  },

  async validateSpecItems(
    items: SpecItem[],
    specContext: string
  ): Promise<SpecItem[]> {
    const provider = (process.env.LLM_PROVIDER || 'none') as LLMProvider;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    const enabled = process.env.LLM_ENABLED === 'true';
    const specValidationEnabled = process.env.LLM_SPEC_VALIDATION_ENABLED === 'true';

    const config: LLMConfig = {
      provider: provider !== 'none' ? provider : undefined,
      apiKey,
      model,
      enabled: enabled && !!apiKey && specValidationEnabled,
    };

    if (!config.enabled) {
      return items;
    }

    const validatedItems: SpecItem[] = [];
    const uncertainItems: SpecItem[] = [];

    for (const item of items) {
      if (!item.text) {
        validatedItems.push(item);
        continue;
      }

      const text = item.text.trim();
      
      // 확실히 유효한 항목 (따옴표로 감싼 텍스트, UI 키워드 포함)
      const isQuoted = item.meta?.source === 'table' && text.includes('"');
      const hasUIKeyword = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달'].some(kw => text.includes(kw));
      
      if (isQuoted || hasUIKeyword) {
        validatedItems.push(item);
        continue;
      }

      // 불확실한 항목 판단
      // 방안 3: 짧은 텍스트(2자 이상)도 불확실한 항목으로 분류
      const isTranslationKeyPattern = /^[a-z0-9_]+$/.test(text) && (text.match(/_/g) || []).length >= 1;
      const isShortText = text.length < 15 && text.length >= 2; // 2자 이상 15자 미만
      const isUncertain = (isTranslationKeyPattern && isShortText) || (!hasUIKeyword && isShortText);

      if (isUncertain) {
        uncertainItems.push(item);
      } else {
        validatedItems.push(item);
      }
    }

    // 불확실한 항목만 LLM 검증 (비용 절감)
    if (uncertainItems.length > 0) {
      console.log(`[LLM] 불확실한 항목 ${uncertainItems.length}개 검증 시작...`);
      
      const validationResults = await Promise.all(
        uncertainItems.map(async (item) => {
          const context = `${item.meta?.section || ''} > ${item.meta?.feature || ''}`.trim();
          const result = await validateSpecItemWithLLM(item, context, config);
          
          if (result.isValid && result.confidence >= 0.7) {
            return item;
          } else {
            console.log(`[LLM] 제외: "${item.text}" (이유: ${result.reason}, 신뢰도: ${result.confidence})`);
            return null;
          }
        })
      );

      const validated = validationResults.filter((item): item is SpecItem => item !== null);
      validatedItems.push(...validated);
      
      console.log(`[LLM] 검증 완료: ${validated.length}/${uncertainItems.length}개 유효`);
    }

    return validatedItems;
  },

  async compareSpecWithFigma(
    specItem: SpecItem,
    figmaNode: UUMNode,
    specContext?: string
  ): Promise<{
    match: boolean;
    matchType: 'EXACT' | 'SEMANTIC' | 'SIMILAR' | 'MISMATCH' | 'MISSING' | 'EXTRA';
    confidence: number;
    reason: string;
    severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO' | 'NONE';
    koreanVariations?: string[];
    suggestion?: string;
  }> {
    const provider = (process.env.LLM_PROVIDER || 'none') as LLMProvider;
    const apiKey = process.env.LLM_API_KEY;
    const model = process.env.LLM_MODEL;
    const enabled = process.env.LLM_ENABLED === 'true';
    const diffEnabled = process.env.LLM_DIFF_ENABLED === 'true';

    const config: LLMConfig = {
      provider: provider !== 'none' ? provider : undefined,
      apiKey,
      model,
      enabled: enabled && !!apiKey && diffEnabled,
    };

    if (!config.enabled || !config.apiKey || config.provider === 'none') {
      // LLM 비활성화 시 기본값 반환 (규칙 기반 결과 사용)
      return {
        match: false,
        matchType: 'MISMATCH',
        confidence: 0.5,
        reason: 'LLM diff 비활성화됨',
        severity: 'INFO',
      };
    }

    const prompt = `한국어 UI/UX 요구사항과 디자인 텍스트를 비교해주세요.

**요구사항 (Spec):**
텍스트: "${specItem.text || ''}"
컨텍스트: ${specItem.sectionPath || specItem.meta?.section || '없음'}
의도: ${specItem.intent || 'UI 텍스트 표시'}
기능: ${specItem.meta?.feature || '없음'}

**디자인 (Figma):**
텍스트: "${figmaNode.text || ''}"
위치: ${figmaNode.figmaPath || figmaNode.path || '없음'}
레이어명: ${figmaNode.name || '없음'}

**한국어 특수 고려사항:**
1. 띄어쓰기 차이 허용: "인기순" = "인기 순" = "인기순위"
2. 조사 변형 허용: "삭제" = "삭제하기" = "삭제하세요"
3. 존댓말 차이 허용: "확인" = "확인하세요" = "확인해주세요"
4. 약어 허용: "인기순" = "인기 순위"
5. 동의어 구분: "삭제" ≠ "제거" (의미가 다를 수 있음)

**비교 기준:**
- EXACT: 완전히 동일
- SEMANTIC: 의미적으로 동일 (띄어쓰기, 조사만 다름)
- SIMILAR: 유사하지만 약간 다름
- MISMATCH: 의미가 다름
- MISSING: Spec에 있지만 Figma에 없음 (이 경우는 비교 대상이 없으므로 발생하지 않음)
- EXTRA: Figma에 있지만 Spec에 없음 (이 경우는 비교 대상이 없으므로 발생하지 않음)

**심각도 판단 기준:**
- CRITICAL: 핵심 기능이 누락되거나 완전히 잘못됨 (예: "삭제" vs "추가")
- MAJOR: 중요한 텍스트가 다르거나 누락됨 (예: "인기순" vs "최신순")
- MINOR: 표현만 다르지만 의미는 동일 (예: "인기순" vs "인기 순")
- INFO: 미미한 차이 또는 스타일 차이
- NONE: 차이 없음

**응답 형식 (JSON만 반환, 다른 설명 없이):**
{
  "match": true/false,
  "matchType": "EXACT" | "SEMANTIC" | "SIMILAR" | "MISMATCH",
  "confidence": 0.0-1.0,
  "reason": "판단 이유 (한국어 특성을 고려한 설명)",
  "severity": "CRITICAL" | "MAJOR" | "MINOR" | "INFO" | "NONE",
  "koreanVariations": ["동일한 의미의 변형들"],
  "suggestion": "개선 제안 (있는 경우)"
}`;

    try {
      let responseText: string;
      
      if (config.provider === 'openai') {
        responseText = await callOpenAI(config.apiKey, config.model || 'gpt-4o-mini', prompt);
      } else if (config.provider === 'anthropic') {
        responseText = await callAnthropic(config.apiKey, config.model || 'claude-3-haiku-20240307', prompt);
      } else {
        return {
          match: false,
          matchType: 'MISMATCH',
          confidence: 0.5,
          reason: 'LLM Provider 없음',
          severity: 'INFO',
        };
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          match: parsed.match === true,
          matchType: parsed.matchType || 'MISMATCH',
          confidence: parsed.confidence || 0.5,
          reason: parsed.reason || 'LLM 판단',
          severity: parsed.severity || 'INFO',
          koreanVariations: parsed.koreanVariations,
          suggestion: parsed.suggestion,
        };
      }
    } catch (error) {
      console.warn(`LLM diff 비교 실패 (${specItem.text} vs ${figmaNode.text}):`, error);
    }

    return {
      match: false,
      matchType: 'MISMATCH',
      confidence: 0.5,
      reason: 'LLM 비교 실패, 기본값 사용',
      severity: 'INFO',
    };
  },
};

export default LLMAdapter;



import { DiffFinding, UUMDocument, SpecItem } from '../../../core-engine/src/types';

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

    const config: LLMConfig = {
      provider: provider !== 'none' ? provider : undefined,
      apiKey,
      model,
      enabled: enabled && !!apiKey,
    };

    if (!config.enabled) {
      return mergeSimilarFindings(findings);
    }

    try {
      return await refineWithLLM(findings, docs, specItems, config);
    } catch (error) {
      console.warn('LLM 후처리 실패, 기본 병합 로직 사용:', error);
      return mergeSimilarFindings(findings);
    }
  },
};

export default LLMAdapter;



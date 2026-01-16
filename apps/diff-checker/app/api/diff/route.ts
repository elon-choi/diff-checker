import { NextResponse } from 'next/server';
import { DiffEngine } from '../../../../../packages/core-engine/src/diff-engine';
import { defaultRules } from '../../../../../packages/core-engine/src/rules';
import { SpecNormalizer } from '../../../../../packages/normalizers/spec-normalizer/src/index';
import { FigmaNormalizer } from '../../../../../packages/normalizers/figma-normalizer/src/index';
import { WebNormalizer } from '../../../../../packages/normalizers/web-normalizer/src/index';
import { AndroidNormalizer } from '../../../../../packages/normalizers/android-normalizer/src/index';
import { IOSNormalizer } from '../../../../../packages/normalizers/ios-normalizer/src/index';
import type { SpecItem } from '../../../../../packages/core-engine/src/types';
import { extractSpecItemsFromTables, extractLatestDateFromHtmlContent } from '../../../lib/table-parser';
import { isNoiseSpecItem, isNoise } from '../../../lib/noise-filter';
import { extractSelectorKeyFromText, removeSelectorKeyFromText, normalizeKey } from '../../../../../packages/core-engine/src/utils/selector-key';
import { LLMAdapter } from '../../../../../packages/adapters/llm-adapter/src/index';

function normalizeSpecHtmlInput(input: string): string {
  let result = input;
  const trimmed = result.trim();

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && (trimmed.includes('\\n') || trimmed.includes('\\"') || trimmed.includes('<table') || trimmed.includes('&lt;table'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        result = parsed;
      }
    } catch {
      // JSON 문자열이 아니면 그대로 진행
    }
  }

  if (result.includes('\\n') || result.includes('\\"') || result.includes('\\t') || result.includes('\\r')) {
    result = result
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }

  if (result.startsWith('"') && result.endsWith('"') && (result.includes('<table') || result.includes('&lt;table'))) {
    result = result.slice(1, -1);
  }

  return decodeHtmlEntitiesIfEscaped(result);
}

function decodeHtmlEntitiesIfEscaped(input: string): string {
  if (input.includes('<table') || !input.includes('&lt;table')) return input;
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// 업데이트 날짜 패턴: "Update date: 25.12.10", "업데이트: 25.12.10", "(Update date: 25.12.10)" 등
const UPDATE_DATE_PATTERNS = [
  /\(?\s*Update\s+date\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*업데이트\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*Update\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*(\d{2}\.\d{2}\.\d{2})\s*update\s*\)?/i,
  /(\d{1,2}[./-]\d{1,2})\s*(?:업데이트|update)/i,
];

// 취소선 패턴: ~~텍스트~~ 또는 <del>텍스트</del>
const STRIKETHROUGH_PATTERN = /~~([^~]+)~~|<del>([^<]+)<\/del>/g;

// 메타데이터 패턴: 비교에서 제외할 텍스트 패턴
const METADATA_PATTERNS = [
  /^배포 예정일/i,
  /^담당 (기획자|개발자|QA)/i,
  /^QA\s*:/i,
  /^지라 티켓/i,
  /^Jira/i,
  /^System Jira/i,
  /^디자인 링크/i,
  /^Update History/i,
  /^일시/i,
  /^내용$/i,
  /^위치 및 버전/i,
  /^항목$/i,
  /^속성$/i,
  /^비고$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^KWQA-\d+$/i, // 티켓 번호
  /^[0-9]+\/[0-9]+\s+업데이트$/i, // 날짜 업데이트 (기존 패턴)
  /^(Red|Blue|Green|Yellow|Purple|Orange)$/i, // 색상 라벨
  /^목차$/i,
  /^E\.O\.D$/i,
  /^NO$/i,
  /^-$/i,
  /^\.$/i,
  /^,$/i,
  /^~$/i,
  /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/i, // 색상 코드 (#F4F5F7 등)
  /^(true|false|none|null|undefined)$/i, // boolean/null 값
  /^(Document|title|screen|sub|txt|line|Body|Frame|Component|Instance)$/i, // Figma 내부 레이블
];

// 문서 구조 패턴: 비교에서 제외할 섹션 헤더
const DOCUMENT_STRUCTURE_PATTERNS = [
  /^#+\s/, // 마크다운 헤더
  /^목차/i,
  /^1\.\s*목표/i,
  /^2\.\s*주요 과제/i,
  /^3\.\s*상세 기획/i,
  /^4\.\s*Backlog/i,
  /^Spec-Out/i,
  /^이전 기획서/i,
];

function isMetadata(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2) return true;
  
  // 메타데이터 패턴 체크
  for (const pattern of METADATA_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  // 문서 구조 패턴 체크
  for (const pattern of DOCUMENT_STRUCTURE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  return false;
}

function normalizeUpdateDate(text: string, fallbackYear?: number): string | undefined {
  const trimmed = text.trim();
  let match = trimmed.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = trimmed.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = trimmed.match(/(\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return `20${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = trimmed.match(/(\d{1,2})[./-](\d{1,2})/);
  if (match && fallbackYear) return `${fallbackYear}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  return;
}

function filterItemsByLatestDate(items: SpecItem[], latestDate?: string): SpecItem[] {
  if (!latestDate) return items;
  return items.filter((item) => {
    const updateDate = item.meta?.updateDate;
    if (!updateDate) return true;
    return updateDate >= latestDate;
  });
}

function parseLineForUpdates(line: string, fallbackYear?: number): { text: string; isDeprecated: boolean; isUpdated: boolean; updateDate?: string } {
  let text = line.trim();
  let isDeprecated = false;
  let isUpdated = false;
  let updateDate: string | undefined;

  // 취소선 처리: ~~텍스트~~ 제거하고 플래그 설정
  const strikethroughMatch = text.match(STRIKETHROUGH_PATTERN);
  if (strikethroughMatch) {
    isDeprecated = true;
    // 취소선 제거하고 내부 텍스트만 추출
    text = text.replace(STRIKETHROUGH_PATTERN, (match, p1, p2) => {
      return p1 || p2 || '';
    }).trim();
  }

  // 업데이트 날짜 패턴 검색
  for (const pattern of UPDATE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      isUpdated = true;
      updateDate = normalizeUpdateDate(match[1] || match[0], fallbackYear) || match[1] || match[0];
      break;
    }
  }

  return { text, isDeprecated, isUpdated, updateDate };
}

async function deriveSpecItemsFromMarkdown(specText: string): Promise<{ items: SpecItem[]; latestSpecDate?: string }> {
  const items: SpecItem[] = [];
  const normalizedSpecText = normalizeSpecHtmlInput(specText);
  let latestSpecDate: string | undefined;
  
  // Phase-2: 섹션 경로 추적을 위한 스택
  const sectionStack: Array<{ level: number; title: string }> = [];
  
  // 섹션 경로 생성 함수
  const getSectionPath = (): string => {
    if (sectionStack.length === 0) return '';
    return sectionStack.map(s => s.title).join(' > ');
  };
  
  // 1. HTML 표 파싱 (표가 있으면 우선 처리)
  const hasTable = normalizedSpecText.includes('<table');
  if (hasTable) {
    try {
      console.log('[DEBUG] 표 파싱 시작, HTML 길이:', normalizedSpecText.length);
      console.log('[DEBUG] HTML 샘플 (처음 1000자):', normalizedSpecText.substring(0, 1000));
      const tableParseResult = await extractSpecItemsFromTables(normalizedSpecText);
      const tableItems = tableParseResult.items;
      latestSpecDate = tableParseResult.updateHistory?.latestDate;
      console.log('[DEBUG] 표에서 추출된 SpecItem 수:', tableItems.length);
      
      // Phase-2: 표 항목에 selectorKey와 sectionPath 추가
      for (const item of tableItems) {
        if (item.text) {
          const selectorKey = extractSelectorKeyFromText(item.text);
          if (selectorKey) {
            item.selectorKey = selectorKey;
            item.text = removeSelectorKeyFromText(item.text);
          }
          // sectionPath는 표 파싱 시 meta.section에서 가져올 수 있음
          if (item.meta?.section) {
            item.sectionPath = item.meta.section;
          }
        }
      }
      
      if (tableItems.length === 0) {
        console.warn('[DEBUG] 표 파싱 결과가 비어있습니다. 표 구조를 확인하세요.');
      } else {
        console.log('[DEBUG] 추출된 SpecItem 예시:', tableItems.slice(0, 3).map(item => ({
          id: item.id,
          text: item.text?.substring(0, 50),
          selectorKey: item.selectorKey,
          sectionPath: item.sectionPath,
          source: item.meta?.source,
        })));
      }
      items.push(...tableItems);
    } catch (e) {
      console.error('[DEBUG] 표 파싱 실패:', e);
      console.error('[DEBUG] 에러 스택:', e instanceof Error ? e.stack : String(e));
    }
  } else {
    console.log('[DEBUG] 표가 없습니다. 텍스트 파싱으로 진행.');
  }
  
  // 2. 텍스트 라인 파싱 (기존 로직)
  const latestSpecYear = latestSpecDate ? Number(latestSpecDate.split('-')[0]) : undefined;
  const lines = normalizedSpecText.split('\n').map((l) => l.trim()).filter(Boolean);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Phase-2: 마크다운 헤더 감지 및 섹션 스택 업데이트
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      
      // 현재 레벨보다 낮거나 같은 헤더가 나오면 스택 정리
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= level) {
        sectionStack.pop();
      }
      sectionStack.push({ level, title });
      continue; // 헤더는 SpecItem으로 추가하지 않음
    }
    
    // 업데이트/취소선 정보 파싱
    const parsed = parseLineForUpdates(line, latestSpecYear);
    
    // 취소선 처리된 항목은 비교 대상에서 제외 (deprecated)
    if (parsed.isDeprecated) {
      continue;
    }
    
    // 업데이트 날짜만 있고 내용이 없는 라인은 메타데이터로 간주하여 제외
    if (parsed.isUpdated && !parsed.text.trim()) {
      continue;
    }
    
    // 파싱된 텍스트 사용
    const processedLine = parsed.text;
    
    // HTML 태그 제거 (표는 이미 처리했으므로)
    const cleanLine = processedLine.replace(/<[^>]+>/g, '').trim();
    if (!cleanLine) continue;
    
    // Phase-2: selectorKey 추출
    const selectorKey = extractSelectorKeyFromText(cleanLine);
    const textWithoutKey = selectorKey ? removeSelectorKeyFromText(cleanLine) : cleanLine;
    const sectionPath = getSectionPath();
    
    // 1. 따옴표로 감싼 텍스트 추출 (UI 텍스트로 간주)
    const quoted = textWithoutKey.match(/"([^"]+)"/);
    if (quoted) {
      const text = quoted[1];
      // 따옴표 텍스트도 메타데이터인지 확인
      if (!isMetadata(text)) {
        // Phase-2: selectorKey와 sectionPath 추가
        items.push({ 
          id: `spec-text-${i}`, 
          kind: 'TEXT', 
          text,
          selectorKey,
          sectionPath: sectionPath || undefined,
          // 헌장 필드 추가 (optional, 기존 동작 유지)
          intent: `UI 텍스트 "${text}"가 화면에 표시되어야 함`,
          expected: text,
          conditions: parsed.isUpdated ? { 
            isUpdated: true, 
            updateDate: parsed.updateDate,
            note: `업데이트됨 (${parsed.updateDate})`
          } : undefined,
          meta: {
            ...(parsed.isUpdated ? { 
              isUpdated: true, 
              updateDate: parsed.updateDate,
            } : {}),
            isDeprecated: parsed.isDeprecated,
          },
        });
      }
      continue;
    }
    
    // 2. 가시성 요구사항
    if (cleanLine.includes('노출되어야') || cleanLine.includes('노출')) {
      // 헌장 반영: RequirementItem 구조로 해석
      items.push({
        id: `spec-visibility-${i}`,
        kind: 'STATE',
        visibility: 'show',
        conditions: { 
          raw: cleanLine,
          ...(parsed.isUpdated ? { 
            isUpdated: true, 
            updateDate: parsed.updateDate,
            note: `업데이트됨 (${parsed.updateDate})`
          } : {})
        },
        // 헌장 필드 추가 (optional, 기존 동작 유지)
        intent: '요구사항에 명시된 요소가 화면에 노출되어야 함',
        expected: true,
      });
      continue;
    }
    
    // 3. 일반 텍스트는 메타데이터가 아닌 경우만 포함
    if (!isMetadata(cleanLine)) {
      // 설명 텍스트 제외: 너무 긴 문장(50자 이상)은 설명으로 간주
      if (cleanLine.length > 50) {
        // UI 관련 키워드가 있으면 포함 (설명 중에도 UI 텍스트가 있을 수 있음)
        const uiKeywords = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달', '클릭', '노출'];
        const hasUIKeyword = uiKeywords.some(keyword => cleanLine.includes(keyword));
        if (!hasUIKeyword) {
          continue; // 설명 텍스트로 간주하고 제외
        }
      }
      
      // UI 관련 키워드가 있는 경우만 포함
      const uiKeywords = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달'];
      const hasUIKeyword = uiKeywords.some(keyword => cleanLine.includes(keyword));
      
      // 짧은 텍스트(20자 이하)이거나 UI 키워드가 있는 경우만 포함
      if (hasUIKeyword || (textWithoutKey.length <= 20 && textWithoutKey.length > 2)) {
        // Phase-2: selectorKey와 sectionPath 추가
        items.push({ 
          id: `spec-text-${i}`, 
          kind: 'TEXT', 
          text: textWithoutKey,
          selectorKey,
          sectionPath: sectionPath || undefined,
          // 헌장 필드 추가 (optional, 기존 동작 유지)
          intent: `UI 텍스트 "${textWithoutKey}"가 화면에 표시되어야 함`,
          expected: textWithoutKey,
          conditions: parsed.isUpdated ? { 
            isUpdated: true, 
            updateDate: parsed.updateDate,
            note: `업데이트됨 (${parsed.updateDate})`
          } : undefined,
          meta: {
            ...(parsed.isUpdated ? { 
              isUpdated: true, 
              updateDate: parsed.updateDate,
            } : {}),
            isDeprecated: parsed.isDeprecated,
          },
        });
      }
    }
  }
  
  const filteredItems = filterItemsByLatestDate(items, latestSpecDate);
  return { items: filteredItems, latestSpecDate };
}

export async function POST(req: Request) {
  try {
    const { phase, specText, specHtml, specBaselineHtml, specBaselineText, figmaJson, webJson, androidJson, iosJson } = await req.json();
    const rules = defaultRules;
    const engine = new DiffEngine(rules);

    const [specDoc, figmaDoc, webDoc, androidDoc, iosDoc] = await Promise.all([
      specText
        ? SpecNormalizer.normalize(specText).catch(() => ({
            platform: 'SPEC' as const,
            source: 'spec.md',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      figmaJson
        ? FigmaNormalizer.normalize(figmaJson).catch(() => ({
            platform: 'FIGMA' as const,
            source: 'figma.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      webJson
        ? WebNormalizer.normalize(webJson).catch(() => ({
            platform: 'WEB' as const,
            source: 'web_dom.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      androidJson
        ? AndroidNormalizer.normalize(androidJson).catch(() => ({
            platform: 'ANDROID' as const,
            source: 'android_dump.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      iosJson
        ? IOSNormalizer.normalize(iosJson).catch(() => ({
            platform: 'IOS' as const,
            source: 'ios_dump.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
    ]);

    // specHtml이 있으면 HTML로 파싱, 없으면 텍스트로 파싱 (이스케이프 복원 포함)
    const specContent = normalizeSpecHtmlInput(specHtml || specText || '');
    
    console.log('[DEBUG] API 호출 정보:');
    console.log('- specHtml 존재:', !!specHtml);
    console.log('- specText 존재:', !!specText);
    console.log('- specContent 길이:', specContent.length);
    console.log('- 표 포함 여부:', specContent.includes('<table'));
    console.log('- specContent 처음 500자:', specContent.substring(0, 500));
    
    const specParseResult = specContent ? await deriveSpecItemsFromMarkdown(specContent) : { items: [] as SpecItem[] };
    let specItems = specParseResult.items;
    let latestSpecDate = specParseResult.latestSpecDate;
    let latestSpecDateSource: string | undefined = latestSpecDate ? 'update-history-table' : undefined;
    const initialSpecItemsCount = specItems.length;
    
    const baselineContent = normalizeSpecHtmlInput(specBaselineHtml || specBaselineText || '');
    if (baselineContent) {
      const baselineDate = extractLatestDateFromHtmlContent(baselineContent);
      if (baselineDate.latestDate) {
        latestSpecDate = baselineDate.latestDate;
        latestSpecDateSource = baselineDate.latestDateRaw ? 'update-history-text-fallback' : latestSpecDateSource;
      }
    }
    
    // LLM 기반 SpecItem 검증 (선택적, 불확실한 항목만)
    const llmSpecValidationEnabled = process.env.LLM_SPEC_VALIDATION_ENABLED === 'true';
    const llmSpecExtractionEnabled = process.env.LLM_SPEC_EXTRACTION_ENABLED === 'true';
    let llmValidationUsed = false;
    let llmValidatedCount = 0;
    let llmExtractionUsed = false;
    let llmExtractionCount = 0;
    
    if (llmSpecValidationEnabled && specItems.length > 0) {
      try {
        console.log('[DEBUG] LLM 기반 SpecItem 검증 시작...');
        const beforeCount = specItems.length;
        const validatedItems = await LLMAdapter.validateSpecItems(specItems, specContent || '');
        if (validatedItems.length === 0) {
          console.warn('[DEBUG] LLM 검증 결과가 0개입니다. 원본 SpecItem을 유지합니다.');
        } else {
          specItems = validatedItems;
        }
        llmValidatedCount = beforeCount - specItems.length;
        llmValidationUsed = true;
        console.log('[DEBUG] LLM 검증 후 SpecItem 수:', specItems.length, `(${llmValidatedCount}개 제외)`);
      } catch (error) {
        console.warn('[DEBUG] LLM 검증 실패, 원본 SpecItem 사용:', error);
      }
    }
    
    // 디버깅: 표 파싱 결과 확인
    const hasTable = specContent?.includes('<table') || false;
    const tableItemsCount = specItems.filter(item => item.meta?.source === 'table').length;
    const textItemsCount = specItems.filter(item => item.meta?.source !== 'table').length;
    
    console.log('[DEBUG] SpecItem 추출 결과:');
    console.log('- 전체 SpecItem 수:', specItems.length);
    console.log('- 표에서 추출된 항목:', tableItemsCount);
    console.log('- 텍스트에서 추출된 항목:', textItemsCount);
    
    // Guardrail: SpecItems가 0개거나 매우 적으면 Diff 실행하지 않음
    let validSpecItems = specItems.filter(item => !isNoiseSpecItem(item));
    
    // 디버깅: 노이즈 필터링 상세 정보
    const noiseFilteredCount = specItems.length - validSpecItems.length;
    const sampleNoiseItems = specItems.filter(item => isNoiseSpecItem(item)).slice(0, 3);
    
    if (validSpecItems.length === 0 && llmSpecExtractionEnabled) {
      try {
        console.log('[DEBUG] LLM 기반 SpecItem 추출 시작...');
        const extractedTexts = await LLMAdapter.extractSpecTexts(specContent || '');
        const dedupedTexts = Array.from(new Set(extractedTexts.map(text => text.trim()).filter(Boolean)));
        const extractedItems = dedupedTexts
          .filter(text => !isNoise(text) && text.length >= 2 && text.length <= 100)
          .map((text, index) => ({
            id: `spec-llm-${index}`,
            kind: 'TEXT' as const,
            text,
            intent: `LLM 추출 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
            expected: text,
            meta: {
              source: 'text' as const,
              column: 'content',
              extraction: 'llm',
            },
          }));

        if (extractedItems.length > 0) {
          llmExtractionUsed = true;
          llmExtractionCount = extractedItems.length;
          specItems = extractedItems;
          validSpecItems = specItems.filter(item => !isNoiseSpecItem(item));
          console.log('[DEBUG] LLM 기반 SpecItem 추출 결과:', extractedItems.length);
        } else {
          console.warn('[DEBUG] LLM 기반 SpecItem 추출 결과가 비어있습니다.');
        }
      } catch (error) {
        console.warn('[DEBUG] LLM 기반 SpecItem 추출 실패:', error);
      }
    }

    if (validSpecItems.length === 0) {
      return NextResponse.json({ 
        error: 'Spec 추출 실패',
        message: `표 파싱 또는 섹션 선택을 확인해주세요. 유효한 SpecItem이 추출되지 않았습니다.\n\n디버깅 정보:\n- 표 포함 여부: ${hasTable ? '예' : '아니오'}\n- 표에서 추출된 항목: ${tableItemsCount}개\n- 텍스트에서 추출된 항목: ${textItemsCount}개\n- 전체 추출 항목: ${specItems.length}개\n- 노이즈 필터링으로 제외된 항목: ${noiseFilteredCount}개\n- 최종 유효 항목: ${validSpecItems.length}개\n- LLM 추출 사용: ${llmSpecExtractionEnabled ? '가능' : '비활성'} / 결과: ${llmExtractionCount}개\n\n제외된 항목 예시:\n${sampleNoiseItems.map(item => `- "${item.text?.substring(0, 30)}" (${item.meta?.source || 'unknown'})`).join('\n')}`,
        specItemsCount: specItems.length,
        validSpecItemsCount: 0,
        debug: {
          hasTable,
          tableItemsCount,
          textItemsCount,
          noiseFilteredCount,
          sampleItems: specItems.slice(0, 10).map(item => ({
            id: item.id,
            text: item.text?.substring(0, 50),
            source: item.meta?.source,
            isNoise: isNoiseSpecItem(item),
          })),
        },
      }, { status: 400 });
    }
    
    // Guardrail: SpecItems(TEXT) 개수 < 5 이면 Diff 실행하지 않음
    // 단, 표 기반 문서에서 최소 개수를 충족하지 못하더라도 표 추출이 성공했다면 진행 허용
    let textSpecItems = validSpecItems.filter((item) => item.kind === 'TEXT' && item.text);
    const hasTableItems = hasTable && tableItemsCount > 0;

    // SpecItem이 부족할 때 LLM으로 보강 추출 (표 기반 문서 포함)
    if (llmSpecExtractionEnabled && textSpecItems.length < 5) {
      try {
        console.log('[DEBUG] SpecItem 부족으로 LLM 보강 추출 시도...');
        const extractedTexts = await LLMAdapter.extractSpecTexts(specContent || '');
        const dedupedTexts = Array.from(new Set(extractedTexts.map(text => text.trim()).filter(Boolean)));

        const existingTextSet = new Set(
          specItems
            .map(item => item.text?.trim().toLowerCase())
            .filter((text): text is string => Boolean(text))
        );

        const extractedItems = dedupedTexts
          .filter(text => !isNoise(text) && text.length >= 2 && text.length <= 100)
          .filter(text => !existingTextSet.has(text.toLowerCase()))
          .map((text, index) => ({
            id: `spec-llm-augment-${index}`,
            kind: 'TEXT' as const,
            text,
            intent: `LLM 보강 추출 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
            expected: text,
            meta: {
              source: 'text' as const,
              column: 'content',
              extraction: 'llm',
            },
          }));

        if (extractedItems.length > 0) {
          llmExtractionUsed = true;
          llmExtractionCount += extractedItems.length;
          specItems = [...specItems, ...extractedItems];
          validSpecItems = specItems.filter(item => !isNoiseSpecItem(item));
          textSpecItems = validSpecItems.filter((item) => item.kind === 'TEXT' && item.text);
          console.log('[DEBUG] LLM 보강 추출 결과:', extractedItems.length, '총 TEXT:', textSpecItems.length);
        } else {
          console.warn('[DEBUG] LLM 보강 추출 결과가 비어있습니다.');
        }
      } catch (error) {
        console.warn('[DEBUG] LLM 보강 추출 실패:', error);
      }
    }

    if (textSpecItems.length < 5 && !hasTableItems) {
      return NextResponse.json({ 
        error: 'Spec 추출 부족',
        message: `Spec에서 UI 텍스트를 거의 추출하지 못했습니다. 표 파싱 / 섹션 선택 / 필터 규칙을 확인하세요.\n\n디버깅 정보:\n- 표 포함 여부: ${hasTable ? '예' : '아니오'}\n- 표에서 추출된 항목: ${tableItemsCount}개\n- 텍스트에서 추출된 항목: ${textItemsCount}개\n- 전체 추출 항목: ${specItems.length}개\n- TEXT 항목: ${textSpecItems.length}개 (최소 5개 필요)`,
        specItemsCount: specItems.length,
        validSpecItemsCount: validSpecItems.length,
        textSpecItemsCount: textSpecItems.length,
        debug: {
          hasTable,
          tableItemsCount,
          textItemsCount,
        },
      }, { status: 400 });
    }
    if (textSpecItems.length < 5 && hasTableItems) {
      console.warn('[DEBUG] 표 기반 SpecItem이 적어도 일부 추출되어 Guardrail을 우회합니다.', {
        textSpecItems: textSpecItems.length,
        tableItemsCount,
        textItemsCount,
      });
    }

    const findings = await engine.runPhase(
      phase as 1 | 2 | 3 | 4,
      {
        spec: specDoc!,
        figma: figmaDoc,
        web: webDoc,
        android: androidDoc,
        ios: iosDoc,
      },
      validSpecItems
    );
    
    // 노이즈 필터링 적용
    const filteredFindings = findings.filter(finding => {
      const figmaText = finding.evidence?.figmaText || finding.evidence?.expected || '';
      if (!figmaText) return true;
      return !isNoise(figmaText);
    });
    
    return NextResponse.json({ 
      findings: filteredFindings,
      summary: {
        total: filteredFindings.length,
        filtered: findings.length - filteredFindings.length,
        specItemsCount: validSpecItems.length,
        specBaseline: {
          date: latestSpecDate,
          source: latestSpecDateSource,
        },
        llmValidation: {
          enabled: llmSpecValidationEnabled,
          used: llmValidationUsed,
          initialCount: initialSpecItemsCount,
          filteredCount: llmValidatedCount,
        },
        llmExtraction: {
          enabled: llmSpecExtractionEnabled,
          used: llmExtractionUsed,
          extractedCount: llmExtractionCount,
        },
      },
      specItems: validSpecItems.map(item => ({
        id: item.id,
        text: item.text,
        selectorKey: item.selectorKey,
        sectionPath: item.sectionPath,
        meta: item.meta,
      }))
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown error' }, { status: 400 });
  }
}




import { readFileSync } from 'fs';
import { join } from 'path';

// deriveSpecItemsFromMarkdown 로직을 직접 테스트
const UPDATE_DATE_PATTERNS = [
  /\(?\s*Update\s+date\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*업데이트\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*Update\s*:\s*(\d{2}\.\d{2}\.\d{2})\s*\)?/i,
  /\(?\s*(\d{2}\.\d{2}\.\d{2})\s*update\s*\)?/i,
];

const STRIKETHROUGH_PATTERN = /~~([^~]+)~~|<del>([^<]+)<\/del>/g;

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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^KWQA-\d+$/i,
  /^[0-9]+\/[0-9]+\s+업데이트$/i,
  /^(Red|Blue|Green|Yellow|Purple|Orange)$/i,
  /^목차$/i,
  /^E\.O\.D$/i,
  /^NO$/i,
  /^-$/i,
  /^\.$/i,
  /^,$/i,
  /^~$/i,
  /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/i,
  /^(true|false|none|null|undefined)$/i,
  /^(Document|title|screen|sub|txt|line|Body|Frame|Component|Instance)$/i,
];

const DOCUMENT_STRUCTURE_PATTERNS = [
  /^#+\s/,
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
  
  for (const pattern of METADATA_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  for (const pattern of DOCUMENT_STRUCTURE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  return false;
}

function parseLineForUpdates(line: string): { text: string; isDeprecated: boolean; isUpdated: boolean; updateDate?: string } {
  let text = line.trim();
  let isDeprecated = false;
  let isUpdated = false;
  let updateDate: string | undefined;

  const strikethroughMatch = text.match(STRIKETHROUGH_PATTERN);
  if (strikethroughMatch) {
    isDeprecated = true;
    text = text.replace(STRIKETHROUGH_PATTERN, (match, p1, p2) => {
      return p1 || p2 || '';
    }).trim();
  }

  for (const pattern of UPDATE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      isUpdated = true;
      updateDate = match[1] || match[0];
      break;
    }
  }

  return { text, isDeprecated, isUpdated, updateDate };
}

function deriveSpecItemsFromMarkdown(specText: string) {
  const lines = specText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: any[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    const parsed = parseLineForUpdates(line);
    
    // 취소선 처리된 항목은 비교 대상에서 제외
    if (parsed.isDeprecated) {
      console.log(`[제외] 취소선: ${line}`);
      continue;
    }
    
    // 업데이트 날짜만 있고 내용이 없는 라인은 메타데이터로 간주하여 제외
    if (parsed.isUpdated && !parsed.text.trim()) {
      console.log(`[제외] 업데이트 날짜만: ${line}`);
      continue;
    }
    
    const processedLine = parsed.text;
    
    // 따옴표로 감싼 텍스트 추출
    const quoted = processedLine.match(/"([^"]+)"/);
    if (quoted) {
      const text = quoted[1];
      if (!isMetadata(text)) {
        items.push({ 
          id: `spec-text-${i}`, 
          kind: 'TEXT', 
          text,
          ...(parsed.isUpdated ? { 
            conditions: { 
              isUpdated: true, 
              updateDate: parsed.updateDate,
              note: `업데이트됨 (${parsed.updateDate})`
            }
          } : {})
        });
        console.log(`[포함] 따옴표 텍스트: "${text}"${parsed.isUpdated ? ` [업데이트: ${parsed.updateDate}]` : ''}`);
      }
      continue;
    }
    
    // 가시성 요구사항
    if (processedLine.includes('노출되어야') || processedLine.includes('노출')) {
      items.push({
        id: `spec-visibility-${i}`,
        kind: 'STATE',
        visibility: 'show',
        conditions: { 
          raw: processedLine,
          ...(parsed.isUpdated ? { 
            isUpdated: true, 
            updateDate: parsed.updateDate,
            note: `업데이트됨 (${parsed.updateDate})`
          } : {})
        },
      });
      console.log(`[포함] 가시성: ${processedLine}${parsed.isUpdated ? ` [업데이트: ${parsed.updateDate}]` : ''}`);
      continue;
    }
    
    // 일반 텍스트
    if (!isMetadata(processedLine)) {
      if (processedLine.length > 50) {
        const uiKeywords = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달', '클릭', '노출'];
        const hasUIKeyword = uiKeywords.some(keyword => processedLine.includes(keyword));
        if (!hasUIKeyword) {
          continue;
        }
      }
      
      const uiKeywords = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달'];
      const hasUIKeyword = uiKeywords.some(keyword => processedLine.includes(keyword));
      
      if (hasUIKeyword || (processedLine.length <= 20 && processedLine.length > 2)) {
        items.push({ 
          id: `spec-text-${i}`, 
          kind: 'TEXT', 
          text: processedLine,
          ...(parsed.isUpdated ? { 
            conditions: { 
              isUpdated: true, 
              updateDate: parsed.updateDate,
              note: `업데이트됨 (${parsed.updateDate})`
            }
          } : {})
        });
        console.log(`[포함] 일반 텍스트: ${processedLine}${parsed.isUpdated ? ` [업데이트: ${parsed.updateDate}]` : ''}`);
      }
    }
  }
  
  return items;
}

async function test() {
  const specPath = join(__dirname, '../resources/samples/spec-with-updates.md');
  const specText = readFileSync(specPath, 'utf-8');

  console.log('=== deriveSpecItemsFromMarkdown 테스트 ===\n');
  
  const items = deriveSpecItemsFromMarkdown(specText);
  
  console.log(`\n=== 최종 결과 ===`);
  console.log(`총 ${items.length}개 항목이 비교 대상으로 추출됨\n`);
  
  const updatedItems = items.filter(item => item.conditions?.isUpdated);
  console.log(`📌 업데이트된 항목 (${updatedItems.length}개):`);
  updatedItems.forEach((item, idx) => {
    console.log(`  ${idx + 1}. "${item.text}" - ${item.conditions.updateDate}`);
  });
  
  console.log(`\n📌 일반 항목 (${items.length - updatedItems.length}개):`);
  items.filter(item => !item.conditions?.isUpdated).forEach((item, idx) => {
    console.log(`  ${idx + 1}. "${item.text}"`);
  });
}

test().catch(console.error);

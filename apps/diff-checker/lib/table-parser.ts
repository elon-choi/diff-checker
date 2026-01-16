import type { SpecItem } from '../../../packages/core-engine/src/types';
import * as cheerio from 'cheerio';
import { extractSelectorKeyFromText, removeSelectorKeyFromText } from '../../../packages/core-engine/src/utils/selector-key';
import { promises as fs } from 'fs';
import path from 'path';

// 설정 파일에서 헤더 키워드 로드 (기본값 포함)
let headerKeywordsConfig: {
  no: string[];
  item: string[];
  attribute: string[];
  content: string[];
  note: string[];
} | null = null;

async function loadHeaderKeywordsConfig() {
  if (headerKeywordsConfig) return headerKeywordsConfig;
  
  try {
    const configPath = path.join(process.cwd(), 'configs/table-parser.config.yaml');
    const configText = await fs.readFile(configPath, 'utf-8');
    
    // 간단한 YAML 파싱
    const config: any = {};
    const lines = configText.split('\n');
    let currentSection: string | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      if (trimmed.startsWith('headerKeywords:')) {
        currentSection = 'headerKeywords';
        config.headerKeywords = {};
        continue;
      }
      
      if (trimmed.match(/^\w+:$/)) {
        const key = trimmed.replace(':', '');
        if (currentSection === 'headerKeywords') {
          config.headerKeywords[key] = [];
        }
        continue;
      }
      
      if (trimmed.startsWith('-')) {
        const value = trimmed.replace(/^-/, '').trim().replace(/^["']|["']$/g, '');
        if (currentSection === 'headerKeywords' && config.headerKeywords) {
          const lastKey = Object.keys(config.headerKeywords).pop();
          if (lastKey) {
            config.headerKeywords[lastKey].push(value);
          }
        }
      }
    }
    
    if (config.headerKeywords) {
      headerKeywordsConfig = config.headerKeywords;
      return headerKeywordsConfig;
    }
  } catch (error) {
    console.warn('[DEBUG] 설정 파일을 읽을 수 없습니다. 기본값을 사용합니다.', error);
  }
  
  // 기본값
  headerKeywordsConfig = {
    no: ['no', '번호', '구분', '순번', 'index'],
    item: ['항목', '요소', 'item', 'element', '구분'],
    attribute: ['속성', 'attribute', 'type', '타입'],
    content: ['내용', 'content', 'text', '텍스트', '문구'],
    note: ['비고', '참고', 'note', 'reference', 'remark', '번역키', 'translation'],
  };
  
  return headerKeywordsConfig;
}

export interface TableRow {
  no?: string;
  item?: string; // 항목
  attribute?: string; // 속성
  content?: string; // 내용 (파싱된 텍스트)
  contentHtml?: string; // 내용 원본 HTML (패턴 매칭용)
  note?: string; // 비고
  [key: string]: string | undefined;
}

export interface UpdateHistoryInfo {
  latestDate?: string; // YYYY-MM-DD
  latestDateRaw?: string;
  latestSource?: string;
  tableIndex?: number;
}

type ParseTableOptions = {
  skipUpdateHistory?: boolean;
};

type ParseTableResult = {
  rows: TableRow[];
  updateHistory?: UpdateHistoryInfo;
};

const UPDATE_HISTORY_HEADER_KEYWORDS = {
  date: ['날짜', '일시', '변경날짜', '수정일자', 'date', 'update date', 'revision date'],
  content: ['내용', '변경', '변경사항', 'update', 'history', 'revision', 'change'],
  version: ['rev', 'ver', 'version', '버전'],
  location: ['위치', 'page', '관련', '링크', '담당자', '작성자'],
};

function isUpdateHistoryTable(headers: string[]): boolean {
  const normalizedHeaders = headers.map((h) => h.toLowerCase());
  const hasDate = UPDATE_HISTORY_HEADER_KEYWORDS.date.some((kw) =>
    normalizedHeaders.some((h) => h.includes(kw))
  );
  const hasContent = UPDATE_HISTORY_HEADER_KEYWORDS.content.some((kw) =>
    normalizedHeaders.some((h) => h.includes(kw))
  );
  const hasVersion = UPDATE_HISTORY_HEADER_KEYWORDS.version.some((kw) =>
    normalizedHeaders.some((h) => h.includes(kw))
  );
  const hasLocation = UPDATE_HISTORY_HEADER_KEYWORDS.location.some((kw) =>
    normalizedHeaders.some((h) => h.includes(kw))
  );
  return hasDate && (hasContent || hasVersion || hasLocation);
}

function countUpdateHistoryHeaderMatches(cellTexts: string[]): number {
  const normalized = cellTexts.map((text) => text.toLowerCase());
  let count = 0;
  if (UPDATE_HISTORY_HEADER_KEYWORDS.date.some((kw) => normalized.some((h) => h.includes(kw)))) count += 1;
  if (UPDATE_HISTORY_HEADER_KEYWORDS.content.some((kw) => normalized.some((h) => h.includes(kw)))) count += 1;
  if (UPDATE_HISTORY_HEADER_KEYWORDS.version.some((kw) => normalized.some((h) => h.includes(kw)))) count += 1;
  if (UPDATE_HISTORY_HEADER_KEYWORDS.location.some((kw) => normalized.some((h) => h.includes(kw)))) count += 1;
  return count;
}

function normalizeDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseDateFromText(text: string, fallbackYear?: number): string | undefined {
  const trimmed = text.trim();
  let match = trimmed.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (match) return normalizeDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = trimmed.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return normalizeDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = trimmed.match(/(\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (match) return normalizeDate(2000 + Number(match[1]), Number(match[2]), Number(match[3]));
  match = trimmed.match(/(\d{1,2})[./-](\d{1,2})/);
  if (match && fallbackYear) return normalizeDate(fallbackYear, Number(match[1]), Number(match[2]));
  return;
}

function extractDateTextFromCell($cell: cheerio.Cheerio<cheerio.Element>): string {
  const timeEl = $cell.find('time[datetime]').first();
  const datetime = timeEl.attr('datetime')?.trim();
  if (datetime) return datetime;
  return $cell.text().trim();
}

function extractLatestDateFromHistoryTable(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<cheerio.Element>,
  headers: string[],
  headerRowIndex: number
): { latestDate?: string; latestDateRaw?: string } {
  let latestDate: string | undefined;
  let latestDateRaw: string | undefined;
  const dateHeaderIndex = headers.findIndex((header) =>
    UPDATE_HISTORY_HEADER_KEYWORDS.date.some((kw) => header.includes(kw))
  );
  if (dateHeaderIndex === -1) return {};
  const rows = $table.find('tr');
  rows.each((rowIndex, row) => {
    if (rowIndex <= headerRowIndex) return;
    const cells = $(row).find('td, th');
    const dateCell = cells.eq(dateHeaderIndex);
    if (!dateCell || dateCell.length === 0) return;
    const text = extractDateTextFromCell(dateCell);
    const normalized = parseDateFromText(text);
    if (normalized) {
      if (!latestDate || normalized > latestDate) {
        latestDate = normalized;
        latestDateRaw = text;
      }
    }
  });
  return { latestDate, latestDateRaw };
}

function extractLatestDateFromTableByDateColumn(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<cheerio.Element>
): { latestDate?: string; latestDateRaw?: string } {
  const columnStats = new Map<number, { count: number; latestDate?: string; latestDateRaw?: string }>();
  const rows = $table.find('tr');
  rows.each((_rowIndex, row) => {
    const cells = $(row).find('td, th');
    cells.each((cellIndex, cell) => {
      const text = extractDateTextFromCell($(cell));
      const normalizedDate = parseDateFromText(text);
      if (!normalizedDate) return;
      const stat = columnStats.get(cellIndex) || { count: 0 };
      stat.count += 1;
      if (!stat.latestDate || normalizedDate > stat.latestDate) {
        stat.latestDate = normalizedDate;
        stat.latestDateRaw = text;
      }
      columnStats.set(cellIndex, stat);
    });
  });
  let bestColumn: { count: number; latestDate?: string; latestDateRaw?: string } | undefined;
  for (const stat of columnStats.values()) {
    if (stat.count >= 2 && (!bestColumn || (stat.latestDate && stat.latestDate > (bestColumn.latestDate || '')))) {
      bestColumn = stat;
    }
  }
  return { latestDate: bestColumn?.latestDate, latestDateRaw: bestColumn?.latestDateRaw };
}

function extractPatternTextsFromHtml(html: string): string[] {
  const patterns = [
    /문구\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g,
    /표시\s*문구\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g,
    /as-is\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g,
    /to-be\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g,
  ];
  const texts = new Set<string>();
  patterns.forEach((pattern) => {
    const matches = [...html.matchAll(pattern)];
    matches.forEach((match) => {
      let text = match[1]?.trim();
      if (!text) return;
      text = text.replace(/<[^>]+>/g, '').trim();
      text = text.replace(/<ac:[^>]+>.*?<\/ac:[^>]+>/g, '').trim();
      text = text.replace(/%\{[^}]+\}/g, '').trim();
      text = text.replace(/\s+/g, ' ').trim();
      if (text.length > 100) {
        const sentenceMatch = text.match(/^.{1,100}[.!?]/);
        if (sentenceMatch) {
          text = sentenceMatch[0].trim();
        } else {
          const words = text.substring(0, 100).split(/\s+/);
          words.pop();
          text = words.join(' ').trim();
        }
      }
      if (text && text.length >= 2 && text.length <= 100 && !shouldExclude(text)) {
        texts.add(text);
      }
    });
  });
  return Array.from(texts);
}

export function extractLatestDateFromHtmlContent(html: string): { latestDate?: string; latestDateRaw?: string } {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const dateCandidates: Array<{ date: string; raw: string }> = [];

  const fullDatePatterns = [
    /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/g,
  ];

  fullDatePatterns.forEach((pattern) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      const normalized = parseDateFromText(match[0]);
      if (normalized) {
        dateCandidates.push({ date: normalized, raw: match[0] });
      }
    });
  });

  const datetimeAttrMatches = [...html.matchAll(/datetime="([^"]+)"/gi)];
  datetimeAttrMatches.forEach((match) => {
    const raw = match[1]?.trim();
    if (!raw) return;
    const normalized = parseDateFromText(raw);
    if (normalized) {
      dateCandidates.push({ date: normalized, raw });
    }
  });

  const latestYear = dateCandidates.reduce((year, candidate) => {
    const match = candidate.date.match(/^(\d{4})-/);
    const candidateYear = match ? Number(match[1]) : undefined;
    if (!candidateYear) return year;
    return !year || candidateYear > year ? candidateYear : year;
  }, undefined as number | undefined);

  if (latestYear) {
    const updateLabelMatches = [...text.matchAll(/(\d{1,2})[./-](\d{1,2})\s*업데이트/g)];
    updateLabelMatches.forEach((match) => {
      const normalized = parseDateFromText(match[0], latestYear);
      if (normalized) {
        dateCandidates.push({ date: normalized, raw: match[0] });
      }
    });
  }

  if (dateCandidates.length === 0) return {};
  const latest = dateCandidates.reduce((acc, current) => {
    if (!acc || current.date > acc.date) return current;
    return acc;
  }, undefined as { date: string; raw: string } | undefined);

  return latest ? { latestDate: latest.date, latestDateRaw: latest.raw } : {};
}

/**
 * HTML 표를 파싱하여 행 데이터 추출
 */
export async function parseTable(html: string, options: ParseTableOptions = {}): Promise<ParseTableResult> {
  const rows: TableRow[] = [];
  const updateHistory: UpdateHistoryInfo = {};
  
  // 서버 사이드에서는 cheerio로 파싱
  if (typeof window === 'undefined') {
    try {
      console.log('[DEBUG] parseTable: cheerio로 파싱 시작, HTML 길이:', html.length);
      
      // 설정 파일에서 헤더 키워드 미리 로드
      const keywordsConfig = await loadHeaderKeywordsConfig();
      const allKeywords = [
        ...keywordsConfig.no,
        ...keywordsConfig.item,
        ...keywordsConfig.attribute,
        ...keywordsConfig.content,
        ...keywordsConfig.note,
      ];
      
      const $ = cheerio.load(html);
      // 모든 표 선택 (중첩된 표 포함)
      const allTables = $('table');
      console.log('[DEBUG] parseTable: 발견된 표 수 (중첩 포함):', allTables.length);
      
      // 중첩된 표 제외: 부모가 table인 표는 제외
      const tables = allTables.filter((_, el) => {
        const $el = $(el);
        const parent = $el.parent();
        // 부모가 table이 아니면 최상위 표
        return !parent.is('table') && !parent.closest('table').length;
      });
      console.log('[DEBUG] parseTable: 최상위 표 수 (중첩 제외):', tables.length);
      
      if (tables.length === 0) {
        console.warn('[DEBUG] parseTable: 표를 찾을 수 없습니다.');
        return { rows: [] };
      }
      
      // 중복 표 제거: 동일 ac:local-id일 때는 "가장 정보량이 많은" 표를 선택
      const processedContentKeys = new Set<string>();
      const uniqueTables: Array<{ table: cheerio.Element; index: number }> = [];
      const bestByLocalId = new Map<string, { table: cheerio.Element; score: number; index: number }>();
      
      // cheerio의 each는 return false로 중단할 수 없으므로 배열로 변환 후 처리
      const tableArray: cheerio.Element[] = [];
      tables.each((_, table) => {
        tableArray.push(table);
      });
      
      console.log(`[DEBUG] parseTable: 배열로 변환된 표 수: ${tableArray.length}`);
      
      const getTableScore = ($table: cheerio.Cheerio<cheerio.Element>): number => {
        const text = $table.text().replace(/\s+/g, ' ').trim();
        const textLength = text.length;
        const rowCount = $table.find('tr').length;
        const cellCount = $table.find('td, th').length;
        
        let headerKeywordMatches = 0;
        const matchedKeywords = new Set<string>();
        $table.find('tr').slice(0, 3).each((_rowIndex, row) => {
          const $row = $(row);
          const cells = $row.find('td, th');
          const cellTexts: string[] = [];
          cells.each((_, cell) => {
            const $cell = $(cell).clone();
            $cell.find('ac\\:structured-macro, ac\\:inline-comment-marker, ac\\:image, script, style').remove();
            const text = $cell.text().trim().toLowerCase();
            if (text) cellTexts.push(text);
          });
          allKeywords.forEach((keyword) => {
            const normalizedKeyword = keyword.toLowerCase();
            if (cellTexts.some((cellText) => cellText.includes(normalizedKeyword))) {
              matchedKeywords.add(normalizedKeyword);
            }
          });
        });
        headerKeywordMatches = matchedKeywords.size;
        
        return headerKeywordMatches * 100000 + rowCount * 1000 + cellCount * 10 + textLength;
      };
      
      for (let i = 0; i < tableArray.length; i++) {
        const table = tableArray[i];
        const $table = $(table);
        
        // 1. ac:local-id가 있는 경우: 동일 ID 중 가장 점수가 높은 표만 유지
        const localId = $table.attr('ac:local-id');
        if (localId) {
          const score = getTableScore($table);
          const existing = bestByLocalId.get(localId);
          if (!existing || score > existing.score) {
            bestByLocalId.set(localId, { table, score, index: i });
            console.log(`[DEBUG] parseTable: 표 ${i + 1}/${tableArray.length} 후보 갱신 (ac:local-id: ${localId}, score: ${score})`);
          } else {
            console.log(`[DEBUG] parseTable: 표 ${i + 1}/${tableArray.length} 중복 제외 (ac:local-id: ${localId}, score: ${score})`);
          }
          continue;
        }
        
        // 2. ac:local-id가 없는 경우: 표의 첫 번째 행 내용으로 중복 체크
        const firstRowText = $table.find('tr').first().text().trim().substring(0, 100);
        if (firstRowText) {
          const tableHash = firstRowText.replace(/\s+/g, ' ').toLowerCase();
          const contentKey = `content:${tableHash}`;
          if (processedContentKeys.has(contentKey)) {
            console.log(`[DEBUG] parseTable: 표 ${i + 1}/${tableArray.length} 중복 건너뛰기 (내용 기반: ${firstRowText.substring(0, 50)}...)`);
            continue;
          }
          processedContentKeys.add(contentKey);
        }
        
        uniqueTables.push({ table, index: i });
        console.log(`[DEBUG] parseTable: 표 ${i + 1}/${tableArray.length} 고유 표 추가 (내용 기반)`);
      }
      
      const localIdTables = Array.from(bestByLocalId.values())
        .sort((a, b) => a.index - b.index)
        .map(({ table, index }) => ({ table, index }));
      
      const mergedTables = [...uniqueTables, ...localIdTables].sort((a, b) => a.index - b.index);
      const mergedTableElements = mergedTables.map(({ table }) => table);
      
      console.log(`[DEBUG] parseTable: 중복 제거 후 고유 표 수: ${mergedTableElements.length} (원본: ${tableArray.length})`);
      console.log(`[DEBUG] parseTable: 유지된 ac:local-id 목록:`, Array.from(bestByLocalId.keys()));
      
      mergedTableElements.forEach((table, tableIndex) => {
        const $table = $(table);
        const tableRows = $table.find('tr');
        
        if (tableRows.length === 0) return;
        
        // 헤더 행 찾기: "NO", "항목", "속성", "내용" 같은 키워드가 있는 행 찾기
        let headerRowIndex = -1;
        const headers: string[] = [];
        
        // 모든 행을 순회하며 헤더 행 찾기
        tableRows.each((rowIndex, row) => {
          const $row = $(row);
          const cells = $row.find('td, th');
          
          // colspan이 있는 행은 제목 행이므로 건너뛰기
          const hasColspan = cells.filter((_, cell) => {
            const colspan = $(cell).attr('colspan');
            return colspan && parseInt(colspan) > 1;
          }).length > 0;
          
          if (hasColspan) {
            return; // 제목 행은 건너뛰기
          }
          
          const cellTexts: string[] = [];
          cells.each((_, cell) => {
            // Confluence 매크로 제거하고 텍스트만 추출
            const $cell = $(cell).clone();
            $cell.find('ac\\:structured-macro, ac\\:inline-comment-marker, ac\\:image, script, style').remove();
            const text = $cell.text().trim().toLowerCase();
            cellTexts.push(text);
          });

          const updateHeaderMatches = countUpdateHistoryHeaderMatches(cellTexts);
          if (updateHeaderMatches >= 2 && headerRowIndex === -1) {
            headerRowIndex = rowIndex;
            headers.push(...cellTexts);
            console.log(`[DEBUG] parseTable: 표 ${tableIndex + 1}의 업데이트 히스토리 헤더 행 발견 (행 ${rowIndex + 1}):`, headers);
            return false; // break .each loop
          }
          
          // 일반 요구사항 표 헤더는 최소 3개 이상의 셀을 가져야 함
          if (cells.length < 3) {
            return;
          }
          
          // 헤더 키워드 확인: 설정 파일의 키워드 목록 사용 (미리 로드된 allKeywords 사용)
          const foundKeywords = allKeywords.filter(keyword => 
            cellTexts.some(text => {
              const normalizedText = text.toLowerCase();
              const normalizedKeyword = keyword.toLowerCase();
              return normalizedText === normalizedKeyword || normalizedText.includes(normalizedKeyword);
            })
          );
          
          // 최소 3개 이상의 헤더 키워드가 일치해야 함 (더 관대한 매칭)
          if (foundKeywords.length >= 3 && headerRowIndex === -1) {
            headerRowIndex = rowIndex;
            headers.push(...cellTexts);
            console.log(`[DEBUG] parseTable: 표 ${tableIndex + 1}의 헤더 행 발견 (행 ${rowIndex + 1}):`, headers);
            return false; // break .each loop
          }
        });
        
        // 헤더를 찾지 못한 경우 첫 번째 행을 헤더로 사용
        if (headerRowIndex === -1) {
          console.warn(`[DEBUG] parseTable: 표 ${tableIndex + 1}에서 헤더 행을 찾지 못했습니다. 첫 번째 행을 헤더로 사용합니다.`);
          const firstRow = tableRows.first();
          firstRow.find('td, th').each((_, cell) => {
            const $cell = $(cell).clone();
            $cell.find('ac\\:structured-macro, ac\\:inline-comment-marker, ac\\:image').remove();
            const text = $cell.text().trim().toLowerCase();
            headers.push(text || '');
          });
          headerRowIndex = 0;
        }
        
        // 업데이트 히스토리 표 감지 및 최신 날짜 추출
        const isHistoryTable = isUpdateHistoryTable(headers);
        if (isHistoryTable) {
          const { latestDate, latestDateRaw } = extractLatestDateFromHistoryTable(
            $,
            $table,
            headers,
            headerRowIndex
          );
          if (latestDate && (!updateHistory.latestDate || latestDate > updateHistory.latestDate)) {
            updateHistory.latestDate = latestDate;
            updateHistory.latestDateRaw = latestDateRaw;
            updateHistory.latestSource = 'update-history-table';
            updateHistory.tableIndex = tableIndex;
          }
          if (options.skipUpdateHistory !== false) {
            console.log(`[DEBUG] parseTable: 표 ${tableIndex + 1}는 업데이트 히스토리 표로 간주되어 스킵합니다.`);
            return;
          }
        }

        if (!isHistoryTable && !updateHistory.latestDate) {
          const { latestDate, latestDateRaw } = extractLatestDateFromTableByDateColumn($, $table);
          if (latestDate) {
            updateHistory.latestDate = latestDate;
            updateHistory.latestDateRaw = latestDateRaw;
            updateHistory.latestSource = 'date-column-fallback';
            updateHistory.tableIndex = tableIndex;
            if (options.skipUpdateHistory !== false) {
              console.log(`[DEBUG] parseTable: 표 ${tableIndex + 1}는 날짜 컬럼 기준 히스토리 표로 간주되어 스킵합니다.`);
              return;
            }
          }
        }
        
        // 데이터 행 파싱 (헤더 행 다음부터)
        let parsedRowCount = 0;
        
        tableRows.each((rowIndex, row) => {
          // 헤더 행은 건너뛰기
          if (rowIndex <= headerRowIndex) return;
          
          const $row = $(row);
          const cells = $row.find('td');
          
          // colspan이 있는 행은 제목 행이므로 건너뛰기 (선택적)
          const hasColspan = cells.filter((_, cell) => {
            const colspan = $(cell).attr('colspan');
            return colspan && parseInt(colspan) > 1;
          }).length > 0;
          
          if (hasColspan && cells.length === 1) {
            console.log(`[DEBUG] parseTable: 행 ${rowIndex + 1}은 제목 행(colspan)이므로 건너뜁니다.`);
            return;
          }
          
          const rowData: TableRow = {};
          
          cells.each((index, cell) => {
            const header = headers[index] || '';
            
            // 원본 HTML 보존 (패턴 매칭용)
            const originalHtml = $(cell).html() || '';
            
            // Confluence 매크로 제거하고 텍스트만 추출
            const $cell = $(cell).clone();
            $cell.find('ac\\:structured-macro, ac\\:inline-comment-marker, ac\\:image, script, style').remove();
            // 링크는 텍스트만 유지
            $cell.find('a').each((_, link) => {
              const linkText = $(link).text();
              $(link).replaceWith(linkText);
            });
            const text = $cell.text().trim();
            
            if (!header) {
              // 헤더가 없으면 인덱스 기반으로 추정
              if (index === 0) rowData.item = text;
              else if (index === 1) rowData.attribute = text;
              else if (index === 2) {
                rowData.content = text;
                rowData.contentHtml = originalHtml;
              }
              else if (index === 3) rowData.note = text;
              return;
            }
            
            if (header.includes('no') || header.includes('번호') || header.includes('구분')) {
              rowData.no = text;
            } else if (header.includes('항목') || header.includes('item') || header.includes('요소')) {
              rowData.item = text;
            } else if (header.includes('속성') || header.includes('attribute')) {
              rowData.attribute = text;
            } else if (header.includes('내용') || header.includes('content')) {
              rowData.content = text;
              rowData.contentHtml = originalHtml; // 원본 HTML 보존
            } else if (header.includes('비고') || header.includes('note') || header.includes('참고')) {
              rowData.note = text;
            } else {
              rowData[header] = text;
            }
          });
          
          // 빈 행은 제외
          if (Object.values(rowData).some(v => v && typeof v === 'string' && v.length > 0)) {
            rows.push(rowData);
            parsedRowCount++;
            if (parsedRowCount <= 2) {
              console.log(`[DEBUG] parseTable: 파싱된 행 ${parsedRowCount}:`, JSON.stringify(rowData, null, 2));
            }
          }
        });
        
        console.log(`[DEBUG] parseTable: 표 ${tableIndex + 1}에서 파싱된 행 수:`, parsedRowCount);
      });
      
      console.log('[DEBUG] parseTable: 최종 파싱된 행 수:', rows.length);
      if (rows.length > 0) {
        console.log('[DEBUG] parseTable: 첫 번째 행 예시:', JSON.stringify(rows[0], null, 2));
      } else {
        console.warn('[DEBUG] parseTable: 파싱된 행이 없습니다. 표 구조를 확인하세요.');
      }
      return { rows, updateHistory: updateHistory.latestDate ? updateHistory : undefined };
    } catch (e) {
      console.error('[DEBUG] parseTable: cheerio 파싱 실패:', e);
      if (e instanceof Error) {
        console.error('[DEBUG] parseTable: 에러 스택:', e.stack);
      }
      // cheerio 파싱 실패 시 정규식으로 폴백
    }
    
    // 폴백: 정규식 기반 파싱
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    if (!tableMatch) return { rows: [] };
    
    for (const tableHtml of tableMatch) {
      // 헤더 행 찾기
      const headerMatch = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
      if (!headerMatch) continue;
      
      const headers: string[] = [];
      const headerCellMatches = headerMatch[1].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
      if (headerCellMatches) {
        headerCellMatches.forEach(cell => {
          const text = cell.replace(/<[^>]+>/g, '').trim().toLowerCase();
          headers.push(text);
        });
      }
      
      // 데이터 행 파싱
      const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
      if (!rowMatches || rowMatches.length < 2) continue;
      
      for (let i = 1; i < rowMatches.length; i++) {
        const rowHtml = rowMatches[i];
        const cellMatches = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (!cellMatches) continue;
        
        const rowData: TableRow = {};
        cellMatches.forEach((cell, index) => {
          const header = headers[index] || '';
          
          // HTML 태그 제거 및 텍스트 추출
          let text = cell.replace(/<[^>]+>/g, '');
          // HTML 엔티티 디코딩
          text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
          text = text.trim();
          
          if (!header) {
            // 헤더가 없으면 인덱스 기반으로 추정
            if (index === 0) rowData.item = text;
            else if (index === 1) rowData.attribute = text;
            else if (index === 2) rowData.content = text;
            else if (index === 3) rowData.note = text;
            return;
          }
          
          if (header.includes('no') || header.includes('번호')) {
            rowData.no = text;
          } else if (header.includes('항목') || header.includes('item')) {
            rowData.item = text;
          } else if (header.includes('속성') || header.includes('attribute')) {
            rowData.attribute = text;
          } else if (header.includes('내용') || header.includes('content')) {
            rowData.content = text;
          } else if (header.includes('비고') || header.includes('note') || header.includes('참고')) {
            rowData.note = text;
          } else {
            rowData[header] = text;
          }
        });
        
        // 빈 행은 제외
        if (Object.values(rowData).some(v => v && typeof v === 'string' && v.length > 0)) {
          rows.push(rowData);
        }
      }
    }
    
    return { rows };
  }

  // 브라우저 환경에서는 DOMParser 사용
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const tables = doc.querySelectorAll('table');

  tables.forEach((table) => {
    const tableRows = table.querySelectorAll('tr');
    
    // 헤더 행 찾기 (첫 번째 행)
    const headerRow = tableRows[0];
    if (!headerRow) return;

    const headers: string[] = [];
    headerRow.querySelectorAll('th, td').forEach((cell) => {
      const text = cell.textContent?.trim() || '';
      headers.push(text.toLowerCase());
    });

    // 데이터 행 파싱 (두 번째 행부터)
    for (let i = 1; i < tableRows.length; i++) {
      const row = tableRows[i];
      const cells = row.querySelectorAll('td');
      
      const rowData: TableRow = {};
      
      cells.forEach((cell, index) => {
        const header = headers[index];
        const text = cell.textContent?.trim() || '';
        
        if (!header) return;
        
        // 헤더 이름에 따라 매핑
        if (header.includes('no') || header.includes('번호')) {
          rowData.no = text;
        } else if (header.includes('항목') || header.includes('item')) {
          rowData.item = text;
        } else if (header.includes('속성') || header.includes('attribute')) {
          rowData.attribute = text;
        } else if (header.includes('내용') || header.includes('content')) {
          rowData.content = text;
        } else if (header.includes('비고') || header.includes('note') || header.includes('참고')) {
          rowData.note = text;
        } else {
          // 기타 컬럼은 헤더 이름으로 저장
          rowData[header] = text;
        }
      });

      // 빈 행은 제외
      if (Object.values(rowData).some(v => v && v.length > 0)) {
        rows.push(rowData);
      }
    }
  });

  return { rows };
}

/**
 * 제외 규칙 체크
 */
function shouldExclude(text: string): boolean {
  if (!text || text.length < 2) return true;
  
  const trimmed = text.trim();
  
  // URL 패턴
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^www\./i.test(trimmed)) return true;
  
  // Jira 티켓 번호
  if (/^[A-Z]+-\d+$/i.test(trimmed)) return true;
  
  // 1자만 있는 경우 제외 (2자 이상은 유효한 UI 텍스트일 수 있음)
  if (trimmed.length < 2) return true;
  
  // 비고, 참고 키워드
  if (/^(비고|참고|note|reference):?$/i.test(trimmed)) return true;
  
  // 스타일/아이콘 설명 (예: "Red", "Blue", "Yellow", "Purple", "Orange")
  if (/^(Red|Blue|Green|Yellow|Purple|Orange|Black|White)$/i.test(trimmed)) return true;
  
  // 아이콘 설명 (예: "icon-", "img-")
  if (/^(icon|img|image)-/i.test(trimmed)) return true;
  
  // 번역키 패턴 제외 (예: "more_myinfo_account_delete_precautions_important_case_1")
  // 언더스코어로 구분된 소문자/숫자 문자열 (3개 이상의 언더스코어 구분자)
  if (/^[a-z0-9_]+$/.test(trimmed) && (trimmed.match(/_/g) || []).length >= 2) {
    // 단, 너무 짧은 경우(10자 미만)는 실제 UI 텍스트일 수 있으므로 제외하지 않음
    if (trimmed.length >= 10) {
      return true;
    }
  }
  
  return false;
}

function extractUpdateDateFromText(text: string, fallbackYear?: number): string | undefined {
  if (!text) return;
  const hasUpdateKeyword = /(업데이트|update|release|변경|수정|revision|history|ver\.|version|rev\.|rev\b)/i.test(text);
  const normalizedDate = parseDateFromText(text, fallbackYear);
  if (!normalizedDate || !hasUpdateKeyword) return;
  return normalizedDate;
}

function getYearFromDate(date?: string): number | undefined {
  if (!date) return;
  const match = date.match(/^(\d{4})-/);
  return match ? Number(match[1]) : undefined;
}

function filterItemsByLatestDate(items: SpecItem[], latestDate?: string): SpecItem[] {
  if (!latestDate) return items;
  return items.filter((item) => {
    const updateDate = item.meta?.updateDate;
    if (!updateDate) return true;
    return updateDate >= latestDate;
  });
}

/**
 * 표 행을 SpecItem으로 변환
 */
type TableRowsToSpecItemsOptions = {
  latestHistoryDate?: string;
};

export function tableRowsToSpecItems(rows: TableRow[], options: TableRowsToSpecItemsOptions = {}): SpecItem[] {
  const items: SpecItem[] = [];
  const extractedTexts = new Set<string>(); // 중복 제거용
  const latestHistoryYear = getYearFromDate(options.latestHistoryDate);
  
  rows.forEach((row, index) => {
    // 항목과 내용이 모두 있어야 유효한 요구사항
    const item = row.item?.trim();
    const content = row.content?.trim();
    const attribute = row.attribute?.trim();
    
    if (!item && !content) return;
    
    // 행 단위 업데이트 날짜 추출
    const rowUpdateDate = extractUpdateDateFromText(
      [item, content, attribute, row.contentHtml].filter(Boolean).join(' '),
      latestHistoryYear
    );
    
    // 내용 컬럼에서 UI 텍스트 추출
    if (content) {
      // 0. "문구 :" 또는 "표시 문구 :" 패턴에서 텍스트 추출
      // 중요: 원본 HTML(contentHtml)을 사용하여 패턴 매칭 (HTML 태그가 구분자 역할)
      const contentHtml = row.contentHtml || content; // 원본 HTML이 있으면 사용, 없으면 파싱된 텍스트 사용
      
      const textPatterns = [
        { name: '문구', pattern: /문구\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g },
        { name: '표시 문구', pattern: /표시\s*문구\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g },
        { name: 'as-is', pattern: /as-is\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g },
        { name: 'to-be', pattern: /to-be\s*:\s*([^\n<]{1,200}?)(?=\s*<|\s*<br\s*\/?>|\s*문구\s*:|표시\s*문구\s*:|as-is\s*:|to-be\s*:|$|\n)/g },
      ];
      
      textPatterns.forEach(({ name, pattern }, pIndex) => {
        if (name === 'as-is') {
          return;
        }
        // 원본 HTML에서 패턴 매칭 (HTML 태그가 구분자 역할)
        const matches = [...contentHtml.matchAll(pattern)];
        matches.forEach((match, mIndex) => {
          let text = match[1]?.trim();
          if (!text) return;
          
          // HTML 태그 제거
          text = text.replace(/<[^>]+>/g, '').trim();
          // Confluence 매크로 제거
          text = text.replace(/<ac:[^>]+>.*?<\/ac:[^>]+>/g, '').trim();
          // 변수 패턴 제거 (예: %{(value)})
          text = text.replace(/%\{[^}]+\}/g, '').trim();
          
          // 공백 정규화 (연속된 공백을 하나로)
          text = text.replace(/\s+/g, ' ').trim();
          
          // 너무 긴 텍스트는 잘라내기 (100자 제한)
          if (text.length > 100) {
            // 마침표, 느낌표, 물음표로 끝나는 문장까지만 추출
            const sentenceMatch = text.match(/^.{1,100}[.!?]/);
            if (sentenceMatch) {
              text = sentenceMatch[0].trim();
            } else {
              // 문장 구분자가 없으면 공백 기준으로 단어 단위로 자르기
              const words = text.substring(0, 100).split(/\s+/);
              words.pop(); // 마지막 불완전한 단어 제거
              text = words.join(' ').trim();
            }
          }
          
          if (text && text.length >= 2 && text.length <= 100 && !shouldExclude(text)) {
            // 중복 제거: 동일한 텍스트가 이미 추출되었으면 건너뛰기
            if (extractedTexts.has(text)) {
              return;
            }
            extractedTexts.add(text);
            
            // Phase-2: selectorKey 추출
            const selectorKey = extractSelectorKeyFromText(text);
            if (selectorKey) {
              text = removeSelectorKeyFromText(text);
            }
            
            items.push({
              id: `table-row-${index}-content-pattern-${pIndex}-${mIndex}`,
              kind: 'TEXT',
              text,
              selectorKey,
              sectionPath: item || undefined,
              intent: `표의 "내용" 컬럼에서 추출된 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
              expected: text,
              conditions: {
                source: 'table',
                item: item,
                attribute: attribute,
                column: 'content',
                ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
              },
              meta: {
                section: item || '표',
                row: index + 1,
                feature: item || text.substring(0, 20),
                source: 'table',
                column: 'content',
                ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
              },
            });
          }
        });
      });
      
      // 1. 따옴표로 감싼 텍스트 추출
      const quotedMatches = content.match(/"([^"]+)"/g);
      if (quotedMatches) {
        quotedMatches.forEach((quoted, qIndex) => {
          let text = quoted.replace(/"/g, '').trim();
          if (text && !shouldExclude(text)) {
            // Phase-2: selectorKey 추출
            const selectorKey = extractSelectorKeyFromText(text);
            if (selectorKey) {
              text = removeSelectorKeyFromText(text);
            }
            
            items.push({
              id: `table-row-${index}-content-quoted-${qIndex}`,
              kind: 'TEXT',
              text,
              selectorKey,
              sectionPath: item || undefined,
              intent: `표의 "내용" 컬럼에서 추출된 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
              expected: text,
              conditions: {
                source: 'table',
                item: item,
                attribute: attribute,
                column: 'content',
                ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
              },
              meta: {
                section: item || '표',
                row: index + 1,
                feature: item || text.substring(0, 20),
                source: 'table',
                column: 'content',
                ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
              },
            });
          }
        });
      }
      
      // 2. "/" 로 구분된 옵션들 추출 (따옴표가 있든 없든 모두 처리)
      // 예: "리스트 : 최신순 / 조회순 / [1a] 전체 인기순 / [1b] 여성 인기순 / [1c] 남성 인기순"
      // -> "최신순", "조회순", "전체 인기순", "여성 인기순", "남성 인기순" 추출
      if (content.includes('/')) {
        // "/" 로 구분된 옵션들 추출
        const options = content.split('/').map(opt => opt.trim()).filter(Boolean);
        options.forEach((option, optIndex) => {
          // "리스트 : " 같은 접두사 제거
          const cleanOption = option.replace(/^(리스트|목록|옵션|선택|필터|정렬)\s*:\s*/i, '').trim();
          
          // "[1a]" 같은 라벨 제거
          let withoutLabel = cleanOption.replace(/^\[[^\]]+\]\s*/, '').trim();
          
          // 라벨 제거 후 추가 텍스트 제거 (예: "남성 인기순[사업부 확인 완료]" -> "남성 인기순")
          // 첫 번째 공백, 대괄호, 특수 문자 전까지만 추출
          withoutLabel = withoutLabel.split(/[\[\(]/)[0].trim();
          
          // 따옴표 제거 (이미 따옴표로 추출된 경우 중복 방지)
          const finalText = withoutLabel.replace(/^["']|["']$/g, '').trim();
          
          // 짧은 텍스트(2-30자)이고 UI 관련 키워드가 있으면 추출
          if (finalText.length >= 2 && finalText.length <= 30) {
            const uiKeywords = ['순', '필터', '정렬', '선택', '버튼', '옵션', '인기', '최신', '조회', '완결', '연재', '기다무', '기다리면무료', '여성', '남성', '전체'];
            const hasUIKeyword = uiKeywords.some(keyword => finalText.includes(keyword));
            
            // 이미 따옴표로 추출된 항목은 제외
            const alreadyExtracted = quotedMatches?.some(quoted => {
              const quotedText = quoted.replace(/"/g, '').trim();
              return finalText === quotedText || finalText.includes(quotedText);
            });
            
            if (!alreadyExtracted && hasUIKeyword && !shouldExclude(finalText)) {
              items.push({
                id: `table-row-${index}-content-option-${optIndex}`,
                kind: 'TEXT',
                text: finalText,
                intent: `표의 "내용" 컬럼에서 추출된 UI 옵션 "${finalText}"가 화면에 표시되어야 함`,
                expected: finalText,
                conditions: {
                  source: 'table',
                  item: item,
                  attribute: attribute,
                  column: 'content',
                  ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
                },
                meta: {
                  section: item || '표',
                  row: index + 1,
                  feature: item || finalText.substring(0, 20),
                  source: 'table',
                  column: 'content',
                  ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
                },
              });
            }
          }
        });
      }
    }
    
    // 항목 컬럼에서도 따옴표로 감싼 텍스트 추출
    if (item) {
      const quotedMatches = item.match(/"([^"]+)"/g);
      if (quotedMatches) {
        quotedMatches.forEach((quoted, qIndex) => {
          const text = quoted.replace(/"/g, '').trim();
          if (text && !shouldExclude(text)) {
            items.push({
              id: `table-row-${index}-item-quoted-${qIndex}`,
              kind: 'TEXT',
              text,
              intent: `표의 "항목" 컬럼에서 추출된 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
              expected: text,
              conditions: {
                source: 'table',
                attribute: attribute,
                column: 'item',
                ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
              },
              meta: {
                section: item || '표',
                row: index + 1,
                feature: text.substring(0, 20),
                source: 'table',
                column: 'item',
                ...(rowUpdateDate ? { isUpdated: true, updateDate: rowUpdateDate } : {}),
              },
            });
          }
        });
      }
    }
    
    // 속성 컬럼 처리 제거: 속성 컬럼의 값("Text", "Button" 등)은 UI 요소 타입 메타데이터이므로
    // 실제 화면에 표시되지 않아 SpecItem으로 생성하지 않음
    // 이전에는 생성했지만, LLM 검증에서 모두 필터링되므로 아예 생성하지 않도록 변경
  });
  
  return items;
}

/**
 * HTML에서 표를 찾아 SpecItem으로 변환
 */
export async function extractSpecItemsFromTables(html: string): Promise<{ items: SpecItem[]; updateHistory?: UpdateHistoryInfo }> {
  try {
    console.log('[DEBUG] extractSpecItemsFromTables 시작, HTML 길이:', html.length);
    const { rows, updateHistory } = await parseTable(html, { skipUpdateHistory: true });
    let derivedUpdateHistory = updateHistory;
    if (!derivedUpdateHistory?.latestDate) {
      const fallback = extractLatestDateFromHtmlContent(html);
      if (fallback.latestDate) {
        derivedUpdateHistory = {
          latestDate: fallback.latestDate,
          latestDateRaw: fallback.latestDateRaw,
          latestSource: 'update-history-text-fallback',
        };
      }
    }
    console.log('[DEBUG] parseTable 결과 행 수:', rows.length);
    if (rows.length > 0) {
      console.log('[DEBUG] 첫 번째 행 예시:', JSON.stringify(rows[0], null, 2));
    } else {
      console.warn('[DEBUG] extractSpecItemsFromTables: 파싱된 행이 없습니다.');
    }
    const items = tableRowsToSpecItems(rows, { latestHistoryDate: derivedUpdateHistory?.latestDate });
    let filteredItems = filterItemsByLatestDate(items, derivedUpdateHistory?.latestDate);
    if (filteredItems.length === 0) {
      const fallbackTexts = extractPatternTextsFromHtml(html);
      if (fallbackTexts.length > 0) {
        filteredItems = fallbackTexts.map((text, index) => ({
          id: `table-fallback-${index}`,
          kind: 'TEXT',
          text,
          intent: `문서에서 추출된 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
          expected: text,
          conditions: {
            source: 'table',
            column: 'content',
          },
          meta: {
            section: '문서',
            row: index + 1,
            feature: text.substring(0, 20),
            source: 'table',
            column: 'content',
          },
        }));
      }
    }
    console.log('[DEBUG] tableRowsToSpecItems 결과 항목 수:', filteredItems.length);
    if (filteredItems.length > 0) {
      console.log('[DEBUG] 첫 번째 SpecItem 예시:', JSON.stringify({
        id: filteredItems[0].id,
        text: filteredItems[0].text?.substring(0, 50),
        source: filteredItems[0].meta?.source,
        column: filteredItems[0].meta?.column,
      }, null, 2));
    } else {
      console.warn('[DEBUG] extractSpecItemsFromTables: 추출된 SpecItem이 없습니다.');
      if (rows.length > 0) {
        console.warn('[DEBUG] extractSpecItemsFromTables: 행은 있지만 SpecItem으로 변환되지 않았습니다. 행 데이터 확인:');
        rows.slice(0, 3).forEach((row, idx) => {
          console.warn(`[DEBUG] 행 ${idx + 1}:`, {
            item: row.item?.substring(0, 30),
            content: row.content?.substring(0, 50),
            attribute: row.attribute,
            note: row.note,
          });
        });
      }
    }
    return { items: filteredItems, updateHistory: derivedUpdateHistory };
  } catch (e) {
    console.error('[DEBUG] extractSpecItemsFromTables 에러:', e);
    throw e;
  }
}

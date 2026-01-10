import type { SpecItem } from '../../../packages/core-engine/src/types';
import * as cheerio from 'cheerio';

export interface TableRow {
  no?: string;
  item?: string; // 항목
  attribute?: string; // 속성
  content?: string; // 내용
  note?: string; // 비고
  [key: string]: string | undefined;
}

/**
 * HTML 표를 파싱하여 행 데이터 추출
 */
export function parseTable(html: string): TableRow[] {
  const rows: TableRow[] = [];
  
  // 서버 사이드에서는 cheerio로 파싱
  if (typeof window === 'undefined') {
    try {
      console.log('[DEBUG] parseTable: cheerio로 파싱 시작, HTML 길이:', html.length);
      const $ = cheerio.load(html);
      const tables = $('table');
      console.log('[DEBUG] parseTable: 발견된 표 수:', tables.length);
      
      if (tables.length === 0) {
        console.warn('[DEBUG] parseTable: 표를 찾을 수 없습니다.');
        return [];
      }
      
      tables.each((tableIndex, table) => {
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
          
          // 헤더 행은 최소 3개 이상의 셀을 가져야 함
          if (cells.length < 3) {
            return;
          }
          
          const cellTexts: string[] = [];
          cells.each((_, cell) => {
            // Confluence 매크로 제거하고 텍스트만 추출
            const $cell = $(cell).clone();
            $cell.find('ac\\:structured-macro, ac\\:inline-comment-marker, ac\\:image, script, style').remove();
            const text = $cell.text().trim().toLowerCase();
            cellTexts.push(text);
          });
          
          // 헤더 키워드 확인: 정확히 "no", "항목", "속성", "내용"이 각각 별도 셀에 있어야 함
          const requiredKeywords = ['no', '항목', '속성', '내용'];
          const foundKeywords = requiredKeywords.filter(keyword => 
            cellTexts.some(text => text === keyword || text === keyword.toLowerCase())
          );
          
          // 최소 3개 이상의 헤더 키워드가 정확히 일치해야 함
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
            parsedRowCount++;
            if (parsedRowCount <= 2) {
              console.log(`[DEBUG] parseTable: 파싱된 행 ${parsedRowCount}:`, JSON.stringify(rowData, null, 2));
            }
          }
        });
        
        console.log(`[DEBUG] parseTable: 표 ${tableIndex + 1}에서 파싱된 행 수:`, parsedRowCount);
      });
      
      console.log('[DEBUG] parseTable: 최종 파싱된 행 수:', rows.length);
      return rows;
    } catch (e) {
      console.error('[DEBUG] parseTable: cheerio 파싱 실패:', e);
      if (e instanceof Error) {
        console.error('[DEBUG] parseTable: 에러 스택:', e.stack);
      }
      // cheerio 파싱 실패 시 정규식으로 폴백
    }
    
    // 폴백: 정규식 기반 파싱
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    if (!tableMatch) return [];
    
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
    
    return rows;
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

  return rows;
}

/**
 * 제외 규칙 체크
 */
function shouldExclude(text: string): boolean {
  if (!text || text.length < 3) return true;
  
  const trimmed = text.trim();
  
  // URL 패턴
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^www\./i.test(trimmed)) return true;
  
  // Jira 티켓 번호
  if (/^[A-Z]+-\d+$/i.test(trimmed)) return true;
  
  // 링크 텍스트 (일반적으로 짧고 의미 없음)
  if (trimmed.length < 3) return true;
  
  // 비고, 참고 키워드
  if (/^(비고|참고|note|reference):?$/i.test(trimmed)) return true;
  
  // 스타일/아이콘 설명 (예: "Red", "Blue", "Yellow", "Purple", "Orange")
  if (/^(Red|Blue|Green|Yellow|Purple|Orange|Black|White)$/i.test(trimmed)) return true;
  
  // 아이콘 설명 (예: "icon-", "img-")
  if (/^(icon|img|image)-/i.test(trimmed)) return true;
  
  return false;
}

/**
 * 표 행을 SpecItem으로 변환
 */
export function tableRowsToSpecItems(rows: TableRow[]): SpecItem[] {
  const items: SpecItem[] = [];
  
  rows.forEach((row, index) => {
    // 비고 컬럼은 제외
    if (row.note) return;
    
    // 항목과 내용이 모두 있어야 유효한 요구사항
    const item = row.item?.trim();
    const content = row.content?.trim();
    const attribute = row.attribute?.trim();
    
    if (!item && !content) return;
    
    // 내용 컬럼에서 UI 텍스트 추출
    if (content) {
      // 1. 따옴표로 감싼 텍스트 추출
      const quotedMatches = content.match(/"([^"]+)"/g);
      if (quotedMatches) {
        quotedMatches.forEach((quoted, qIndex) => {
          const text = quoted.replace(/"/g, '').trim();
          if (text && !shouldExclude(text)) {
            items.push({
              id: `table-row-${index}-content-quoted-${qIndex}`,
              kind: 'TEXT',
              text,
              intent: `표의 "내용" 컬럼에서 추출된 UI 텍스트 "${text}"가 화면에 표시되어야 함`,
              expected: text,
              conditions: {
                source: 'table',
                item: item,
                attribute: attribute,
                column: 'content',
              },
              meta: {
                section: item || '표',
                row: index + 1,
                feature: item || text.substring(0, 20),
                source: 'table',
                column: 'content',
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
                },
                meta: {
                  section: item || '표',
                  row: index + 1,
                  feature: item || finalText.substring(0, 20),
                  source: 'table',
                  column: 'content',
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
              },
              meta: {
                section: item || '표',
                row: index + 1,
                feature: text.substring(0, 20),
                source: 'table',
                column: 'item',
              },
            });
          }
        });
      }
    }
    
    // 속성 컬럼 처리 (예: "Text", "Button", "Filter" 등)
    if (attribute) {
      const attrTrimmed = attribute.trim();
      if (attrTrimmed && !shouldExclude(attrTrimmed)) {
        // UI 관련 속성만 포함
        const uiAttributes = ['Text', 'Button', 'Filter', 'Select', 'Option', 'Label', 'Input', 'Checkbox', 'Radio'];
        const isUIAttribute = uiAttributes.some(attr => attrTrimmed.includes(attr));
        
        if (isUIAttribute && attrTrimmed.length <= 30) {
          items.push({
            id: `table-row-${index}-attribute`,
            kind: 'TEXT',
            text: attrTrimmed,
            intent: `표의 "속성" 컬럼에서 추출된 UI 속성 "${attrTrimmed}"`,
            expected: attrTrimmed,
            conditions: {
              source: 'table',
              item: item,
              column: 'attribute',
            },
            meta: {
              section: item || '표',
              row: index + 1,
              feature: item || attrTrimmed,
              source: 'table',
              column: 'attribute',
            },
          });
        }
      }
    }
  });
  
  return items;
}

/**
 * HTML에서 표를 찾아 SpecItem으로 변환
 */
export function extractSpecItemsFromTables(html: string): SpecItem[] {
  try {
    console.log('[DEBUG] extractSpecItemsFromTables 시작, HTML 길이:', html.length);
    const rows = parseTable(html);
    console.log('[DEBUG] parseTable 결과 행 수:', rows.length);
    if (rows.length > 0) {
      console.log('[DEBUG] 첫 번째 행 예시:', JSON.stringify(rows[0], null, 2));
    }
    const items = tableRowsToSpecItems(rows);
    console.log('[DEBUG] tableRowsToSpecItems 결과 항목 수:', items.length);
    return items;
  } catch (e) {
    console.error('[DEBUG] extractSpecItemsFromTables 에러:', e);
    throw e;
  }
}

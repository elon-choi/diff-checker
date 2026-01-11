export interface WikiSection {
  id: string;
  level: number;
  title: string;
  html: string;
  text: string;
  children: WikiSection[];
}

/**
 * HTML에서 h1~h6 구조를 파싱하여 섹션 트리 생성
 */
export function parseWikiSections(html: string): WikiSection[] {
  // HTML을 파싱하기 위해 DOMParser 사용 (브라우저 환경)
  if (typeof window === 'undefined') {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 본문 영역 찾기 (Confluence의 경우 .wiki-content 또는 body)
  const contentArea = doc.querySelector('.wiki-content, .confluence-content, body') || doc.body;
  
  // 모든 헤딩 요소 찾기
  const headings = Array.from(contentArea.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  
  if (headings.length === 0) {
    // 헤딩이 없으면 전체를 하나의 섹션으로 처리
    const text = extractTextFromHtml(html);
    return [{
      id: 'root',
      level: 0,
      title: '전체 내용',
      html: html,
      text: text,
      children: [],
    }];
  }

  const sections: WikiSection[] = [];
  const stack: WikiSection[] = [];

  headings.forEach((heading, index) => {
    const level = parseInt(heading.tagName.substring(1));
    const title = heading.textContent?.trim() || '';
    const id = `section-${index}-${title.substring(0, 20).replace(/\s+/g, '-')}`;

    // 현재 헤딩부터 다음 헤딩(같거나 더 높은 레벨)까지의 HTML 추출
    // 표, 리스트, 단락 등 모든 내용 포함
    
    // 모든 헤딩 중에서 다음 헤딩 찾기 (표 내부 헤딩 제외)
    let nextHeading: Element | null = null;
    for (let i = index + 1; i < headings.length; i++) {
      const nextH = headings[i];
      const nextLevel = parseInt(nextH.tagName.substring(1));
      
      // 표 내부의 헤딩은 무시 (하위 섹션으로 처리)
      if (nextH.closest('table')) {
        continue;
      }
      
      // 같은 레벨이거나 더 높은 레벨의 헤딩을 찾으면 중단
      if (nextLevel <= level) {
        nextHeading = nextH;
        break;
      }
    }
    
    // Range API를 사용하여 헤딩부터 다음 헤딩 전까지의 모든 내용 추출
    const range = doc.createRange();
    range.setStartBefore(heading);
    
    if (nextHeading) {
      range.setEndBefore(nextHeading);
    } else {
      // 다음 헤딩이 없으면 컨테이너 끝까지
      range.setEndAfter(contentArea.lastChild || contentArea);
    }
    
    // Range의 내용을 추출
    const tempDiv = doc.createElement('div');
    tempDiv.appendChild(range.cloneContents());
    
    const sectionHtml = tempDiv.innerHTML;
    const text = extractTextFromHtml(sectionHtml);

    const section: WikiSection = {
      id,
      level,
      title,
      html: sectionHtml,
      text,
      children: [],
    };

    // 스택에서 현재 레벨보다 높은 레벨의 섹션 제거
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    // 부모 섹션에 추가
    if (stack.length === 0) {
      sections.push(section);
    } else {
      stack[stack.length - 1].children.push(section);
    }

    stack.push(section);
  });

  return sections;
}


/**
 * 선택된 섹션 ID들로부터 HTML 추출
 */
export function extractSelectedSectionsHtml(
  html: string,
  sectionIds: string[]
): string {
  if (sectionIds.length === 0) {
    return '';
  }

  const sections = parseWikiSections(html);
  const selectedSections: WikiSection[] = [];

  function collectSections(sections: WikiSection[]) {
    for (const section of sections) {
      if (sectionIds.includes(section.id)) {
        selectedSections.push(section);
      }
      // 하위 섹션도 재귀적으로 확인
      if (section.children.length > 0) {
        collectSections(section.children);
      }
    }
  }

  collectSections(sections);

  // 선택된 섹션의 HTML을 합침 (순서 유지)
  const selectedHtml = selectedSections.map(s => s.html).join('\n\n');
  
  return selectedHtml || '';
}

/**
 * PDF 텍스트에서 섹션 구조 파싱
 * 숫자로 시작하는 제목, 특정 키워드로 시작하는 줄 등을 섹션으로 인식
 */
export function parsePdfSections(text: string): WikiSection[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) {
    return [{
      id: 'root',
      level: 0,
      title: '전체 내용',
      html: text,
      text: text,
      children: [],
    }];
  }

  const sections: WikiSection[] = [];
  const stack: WikiSection[] = [];

  // 섹션 제목 패턴: 숫자로 시작하는 제목 (예: "1. 목표", "2. 주요 과제")
  // 또는 특정 키워드로 시작하는 줄 (예: "목표", "주요 과제", "상세 기획")
  const sectionPatterns = [
    /^(\d+)[\.\)]\s+(.+)$/, // "1. 제목" 또는 "1) 제목"
    /^([가-힣]+)\s*$/, // 한글 단어만 있는 줄 (짧은 경우)
  ];

  const sectionKeywords = ['목표', '주요', '과제', '기획', '상세', '정책', '요구사항', '기능', '업데이트', '히스토리', '공통'];

  let sectionIndex = 0;
  let currentSectionTitle = '';
  let currentSectionLevel = 1;
  let currentSectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let isSectionTitle = false;
    let level = 1;
    let title = '';

    // 패턴 1: 숫자로 시작하는 제목 (예: "1. 목표", "2. 주요 과제", "1) 목표")
    // 단, 제목이 너무 길면 섹션이 아닐 수 있음 (예: "1. 시간표 탭 내 정렬 > 인기순 세분화 7/31 업데이트..."는 섹션)
    const numberMatch = line.match(/^(\d+)[\.\)]\s*(.+)$/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1]);
      const fullTitle = numberMatch[2].trim();
      
      // 제목이 너무 길면 (예: 200자 이상) 섹션이 아닐 수 있음
      // 하지만 "1. 시간표 탭 내 정렬 > 인기순 세분화 7/31 업데이트..." 같은 경우는 섹션
      // 따라서 숫자로 시작하고 제목이 있으면 섹션으로 인식
      if (fullTitle.length > 0 && fullTitle.length < 300) {
        // 제목에서 업데이트 날짜나 상태 매크로 제거 (예: "7/31 업데이트", "Blue" 등)
        // 실제 제목만 추출
        const cleanTitle = fullTitle
          .replace(/\s+\d+\/\d+\s+업데이트\s*[가-힣A-Za-z]*/gi, '') // "7/31 업데이트Blue" 제거
          .replace(/\s+\d+\/\d+\s+업데이트/gi, '') // "8/12 업데이트" 제거
          .replace(/\s+[A-Z][a-z]+\s*$/g, '') // 끝의 색상 이름 제거 (예: "Blue", "Yellow")
          .replace(/\s+/g, ' ') // 여러 공백을 하나로
          .trim();
        
        title = cleanTitle || fullTitle; // 정리된 제목이 비어있으면 원본 사용
        // 숫자 앞에 "1. " 같은 형식이 있으면 레벨 1로 처리 (위키의 h3와 유사)
        // 하지만 숫자가 작을수록 더 높은 레벨 (1-3: 레벨 1, 4-6: 레벨 2, 등)
        level = num <= 3 ? 1 : num <= 6 ? 2 : 3;
        isSectionTitle = true;
      }
    }

    // 패턴 2: 특정 키워드로 시작하는 짧은 줄
    if (!isSectionTitle && line.length < 80 && line.length > 2) {
      for (const keyword of sectionKeywords) {
        if (line.startsWith(keyword) || line === keyword || line.match(new RegExp(`^${keyword}[\\s:]`))) {
          title = line;
          level = 1;
          isSectionTitle = true;
          break;
        }
      }
    }

    // 패턴 3: 대문자로 시작하고 짧은 줄 (영문 문서용)
    if (!isSectionTitle && /^[A-Z][A-Za-z\s]{1,40}$/.test(line) && line.length < 60) {
      title = line;
      level = 1;
      isSectionTitle = true;
    }

    if (isSectionTitle && title) {
      // 이전 섹션 저장
      if (currentSectionTitle && currentSectionLines.length > 0) {
        const sectionText = currentSectionLines.join('\n');
        const sectionHtml = `<div class="pdf-section">\n<h${currentSectionLevel}>${currentSectionTitle}</h${currentSectionLevel}>\n<pre>${sectionText}</pre>\n</div>`;
        
        const id = `pdf-section-${sectionIndex}-${currentSectionTitle.substring(0, 20).replace(/\s+/g, '-')}`;
        sectionIndex++;

        const section: WikiSection = {
          id,
          level: currentSectionLevel,
          title: currentSectionTitle,
          html: sectionHtml,
          text: sectionText,
          children: [],
        };

        // 스택에서 현재 레벨보다 높은 레벨의 섹션 제거
        while (stack.length > 0 && stack[stack.length - 1].level >= currentSectionLevel) {
          stack.pop();
        }

        // 부모 섹션에 추가
        if (stack.length === 0) {
          sections.push(section);
        } else {
          stack[stack.length - 1].children.push(section);
        }

        stack.push(section);
      }

      // 새 섹션 시작
      currentSectionTitle = title;
      currentSectionLevel = level;
      currentSectionLines = [line];
    } else {
      // 현재 섹션에 라인 추가
      if (currentSectionTitle) {
        currentSectionLines.push(line);
      } else {
        // 섹션이 없으면 첫 번째 섹션으로 시작
        currentSectionTitle = '전체 내용';
        currentSectionLevel = 0;
        currentSectionLines = [line];
      }
    }
  }

  // 마지막 섹션 저장
  if (currentSectionTitle && currentSectionLines.length > 0) {
    const sectionText = currentSectionLines.join('\n');
    const sectionHtml = `<div class="pdf-section">\n<h${currentSectionLevel}>${currentSectionTitle}</h${currentSectionLevel}>\n<pre>${sectionText}</pre>\n</div>`;
    
    const id = `pdf-section-${sectionIndex}-${currentSectionTitle.substring(0, 20).replace(/\s+/g, '-')}`;

    const section: WikiSection = {
      id,
      level: currentSectionLevel,
      title: currentSectionTitle,
      html: sectionHtml,
      text: sectionText,
      children: [],
    };

    // 스택에서 현재 레벨보다 높은 레벨의 섹션 제거
    while (stack.length > 0 && stack[stack.length - 1].level >= currentSectionLevel) {
      stack.pop();
    }

    // 부모 섹션에 추가
    if (stack.length === 0) {
      sections.push(section);
    } else {
      stack[stack.length - 1].children.push(section);
    }
  }

  // 섹션이 없으면 전체를 하나의 섹션으로 처리
  if (sections.length === 0) {
    return [{
      id: 'root',
      level: 0,
      title: '전체 내용',
      html: `<div class="pdf-section"><pre>${text}</pre></div>`,
      text: text,
      children: [],
    }];
  }

  // "전체 내용" 섹션만 있고 하위 섹션이 있으면, 하위 섹션들을 최상위로 올림
  if (sections.length === 1 && sections[0].title === '전체 내용' && sections[0].children.length > 0) {
    return sections[0].children;
  }

  return sections;
}

/**
 * 선택된 PDF 섹션의 텍스트 추출
 */
export function extractSelectedPdfSections(
  text: string,
  sectionIds: string[]
): string {
  if (sectionIds.length === 0) {
    return '';
  }

  const sections = parsePdfSections(text);
  const selectedSections: WikiSection[] = [];

  function collectSections(sections: WikiSection[]) {
    for (const section of sections) {
      if (sectionIds.includes(section.id)) {
        selectedSections.push(section);
      }
      if (section.children.length > 0) {
        collectSections(section.children);
      }
    }
  }

  collectSections(sections);

  // 선택된 섹션의 텍스트를 합침 (순서 유지)
  const selectedText = selectedSections.map(s => s.text).join('\n\n');
  
  return selectedText || '';
}

/**
 * HTML에서 텍스트 추출
 */
function extractTextFromHtml(html: string): string {
  if (typeof window === 'undefined') {
    // 서버 사이드에서는 간단한 정규식으로 처리
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/\n+/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 스크립트와 스타일 제거
  doc.querySelectorAll('script, style').forEach(el => el.remove());
  
  return doc.body?.textContent?.trim() || '';
}

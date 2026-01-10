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

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url, confluenceEmail, confluenceToken, confluenceBaseUrl } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '위키 URL이 필요합니다.' }, { status: 400 });
    }

    // Confluence URL인지 확인
    const isConfluenceUrl = url.includes('atlassian.net') || url.includes('confluence');
    
    // Confluence API 사용 (인증 정보가 제공된 경우)
    if (isConfluenceUrl && confluenceEmail && confluenceToken) {
      try {
        // Base URL이 없으면 URL에서 자동 추출
        let baseUrl = confluenceBaseUrl;
        if (!baseUrl) {
          const urlMatch = url.match(/https?:\/\/[^\/]+/);
          if (urlMatch) {
            baseUrl = urlMatch[0];
          } else {
            return NextResponse.json(
              { error: 'Base URL을 입력하거나 URL에서 자동 추출할 수 없습니다.' },
              { status: 400 }
            );
          }
        }
        
        const pageId = extractConfluencePageId(url);
        if (!pageId) {
          return NextResponse.json(
            { error: 'Confluence 페이지 ID를 추출할 수 없습니다. URL 형식을 확인하세요.' },
            { status: 400 }
          );
        }

        const apiUrl = `${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.storage`;
        const auth = Buffer.from(`${confluenceEmail}:${confluenceToken}`).toString('base64');

        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 401) {
            return NextResponse.json(
              { error: 'Confluence 인증에 실패했습니다. 이메일과 API 토큰을 확인하세요.', requiresAuth: true },
              { status: 401 }
            );
          }
          if (response.status === 404) {
            return NextResponse.json(
              { error: 'Confluence 페이지를 찾을 수 없습니다. 페이지 ID와 접근 권한을 확인하세요.' },
              { status: 404 }
            );
          }
          return NextResponse.json(
            { error: `Confluence API 오류 (${response.status}): ${errorText.substring(0, 200)}` },
            { status: response.status }
          );
        }

        const data = await response.json();
        const htmlContent = data.body?.storage?.value || '';
        const textContent = extractTextFromHtml(htmlContent);

        return NextResponse.json({ text: textContent });
      } catch (e: any) {
        return NextResponse.json(
          { error: `Confluence API 호출 실패: ${e?.message}` },
          { status: 500 }
        );
      }
    }

    // 공개 위키 (인증 불필요)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Diff-Checker/1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            error: '인증이 필요한 위키입니다. Confluence를 사용하는 경우 이메일, API 토큰, Base URL을 입력하세요.',
            requiresAuth: true,
          },
          { status: 401 }
        );
      }
      throw new Error(`위키 페이지를 가져올 수 없습니다: ${response.status}`);
    }

    const html = await response.text();
    
    // 로그인 페이지인지 확인
    if (html.includes('Log in with Atlassian') || html.includes('JavaScript is disabled')) {
      return NextResponse.json(
        {
          error: '인증이 필요한 위키입니다. Confluence를 사용하는 경우 이메일, API 토큰, Base URL을 입력하세요.',
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const textContent = extractTextFromHtml(html);

    return NextResponse.json({ text: textContent });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '위키 내용을 가져오는데 실패했습니다.' }, { status: 500 });
  }
}

function extractConfluencePageId(url: string): string | null {
  // URL 형식 1: https://domain.atlassian.net/wiki/spaces/SPACE/pages/PAGE_ID/...
  const match1 = url.match(/\/pages\/(\d+)/);
  if (match1) return match1[1];

  // URL 형식 2: https://domain.atlassian.net/wiki/pages/viewpage.action?pageId=PAGE_ID
  const match2 = url.match(/[?&]pageId=(\d+)/);
  if (match2) return match2[1];

  return null;
}

function extractTextFromHtml(html: string): string {
  // 간단한 HTML 태그 제거 및 텍스트 추출
  // 실제 구현에서는 cheerio나 jsdom 같은 라이브러리를 사용하는 것이 좋습니다
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n+/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

  // 기본적인 정리
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text;
}


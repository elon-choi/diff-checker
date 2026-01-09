import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Figma 파일 URL이 필요합니다.' }, { status: 400 });
    }

    // 토큰 우선순위: 클라이언트 토큰 > 서버 환경 변수
    const clientToken = token && typeof token === 'string' ? token : null;
    const serverToken = process.env.FIGMA_TOKEN;
    const tokenToUse = clientToken || serverToken;

    if (!tokenToUse) {
      return NextResponse.json(
        { error: 'Figma Personal Access Token이 필요합니다. 토큰을 입력하거나 서버 환경 변수(FIGMA_TOKEN)를 설정하세요.' },
        { status: 400 }
      );
    }

    // URL에서 파일 키 추출
    // 지원 형식:
    // - https://www.figma.com/file/{FILE_KEY}/파일이름
    // - https://www.figma.com/design/{FILE_KEY}/파일이름
    const fileKeyMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!fileKeyMatch) {
      return NextResponse.json(
        { 
          error: '올바른 Figma 파일 URL 형식이 아닙니다. 예: https://www.figma.com/file/... 또는 https://www.figma.com/design/...' 
        }, 
        { status: 400 }
      );
    }

    const fileKey = fileKeyMatch[1];

    // Figma API 호출
    // 참고: Rate limit(429) 에러 발생 시 재시도하지 않음
    // 이유: 이미 한도 초과 상태에서 재시도하면 추가 요청이 발생하여 한도가 더 소진됨
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: {
        'X-Figma-Token': tokenToUse,
      },
    });

    // response가 null인 경우 처리 (이론적으로 발생하지 않지만 타입 안전성)
    if (!response) {
      return NextResponse.json(
        { error: 'Figma API 호출에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Figma 파일에 접근할 수 없습니다. 토큰과 파일 접근 권한을 확인하세요.' },
          { status: 403 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json({ error: 'Figma 파일을 찾을 수 없습니다.' }, { status: 404 });
      }
      if (response.status === 429) {
        // Rate limit 에러에 대한 명확한 안내
        const errorText = await response.text();
        let errorMessage = 'Figma API 요청 한도가 초과되었습니다. 잠시 후 다시 시도해주세요.';
        
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.err === 'Rate limit exceeded') {
            errorMessage = 'Figma API 요청 한도가 초과되었습니다. 몇 분 후 다시 시도해주세요.\n\n대안: Figma Plugin을 사용하여 JSON을 직접 복사해 붙여넣으세요.';
          }
        } catch {
          // JSON 파싱 실패 시 기본 메시지 사용
        }
        
        return NextResponse.json(
          { error: errorMessage },
          { status: 429 }
        );
      }
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Figma API 오류: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({ json: data, fileKey });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Figma 파일을 가져오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}


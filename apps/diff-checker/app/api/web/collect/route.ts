import { NextResponse } from 'next/server';
import { WebCollector } from '@diff-checker/web-collector';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink } from 'fs/promises';

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '웹 페이지 URL이 필요합니다.' }, { status: 400 });
    }

    // URL 유효성 검사
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: '올바른 URL 형식이 아닙니다. 예: https://example.com' },
        { status: 400 }
      );
    }

    // 임시 파일 경로 생성
    const tempFile = join(tmpdir(), `web-dom-${Date.now()}.json`);

    try {
      // WebCollector를 사용하여 DOM 추출
      // 헤드리스 모드로 실행 (서버 환경에서는 UI가 필요 없음)
      const result = await WebCollector.collect(url, tempFile, {
        headed: false,
        timeoutMs: 30000,
        waitUntil: 'networkidle',
      });

      // 추출된 JSON 파일 읽기
      const fs = await import('fs/promises');
      const jsonContent = await fs.readFile(tempFile, 'utf-8');
      const jsonData = JSON.parse(jsonContent);

      // 임시 파일 삭제
      await unlink(tempFile).catch(() => {
        // 삭제 실패해도 무시 (임시 파일이므로)
      });

      return NextResponse.json({
        json: jsonData,
        count: result.count,
        url: result.url,
      });
    } catch (collectError: any) {
      // 임시 파일 정리
      await unlink(tempFile).catch(() => {});

      // Playwright 미설치 에러 처리
      if (collectError.message?.includes('playwright가 설치되어 있지 않습니다')) {
        return NextResponse.json(
          {
            error: 'Web DOM 자동 수집 기능을 사용하려면 Playwright가 필요합니다.\n\n대안: 브라우저 콘솔 방식을 사용하세요.',
          },
          { status: 503 }
        );
      }

      // 타임아웃 에러 처리
      if (collectError.message?.includes('timeout') || collectError.message?.includes('Timeout')) {
        return NextResponse.json(
          {
            error: '웹 페이지 로딩 시간이 초과되었습니다. URL을 확인하거나 네트워크 상태를 확인하세요.',
          },
          { status: 408 }
        );
      }

      throw collectError;
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '웹 페이지를 가져오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

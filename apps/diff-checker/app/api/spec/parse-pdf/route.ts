import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'PDF 파일이 필요합니다.' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'PDF 파일만 업로드 가능합니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdfParse(buffer);
    const text = data.text;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'PDF에서 텍스트를 추출할 수 없습니다.' }, { status: 400 });
    }

    // 텍스트 정리: 여러 공백을 하나로, 줄바꿈 정리
    const cleanedText = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    return NextResponse.json({ text: cleanedText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'PDF 파싱에 실패했습니다.' }, { status: 500 });
  }
}



import { NextResponse } from 'next/server';

const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  if (result.messages.length > 0) {
    console.warn('[DOCX] 변환 경고:', result.messages);
  }
  return result.value;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '파일이 필요합니다.' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isPdf = fileName.endsWith('.pdf');
    const isDocx = fileName.endsWith('.docx');

    if (!isPdf && !isDocx) {
      return NextResponse.json({ error: 'PDF 또는 DOCX 파일만 업로드 가능합니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const text = isPdf
      ? await extractTextFromPdf(buffer)
      : await extractTextFromDocx(buffer);

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: '파일에서 텍스트를 추출할 수 없습니다.' }, { status: 400 });
    }

    const cleanedText = text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n');

    return NextResponse.json({ text: cleanedText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '파일 파싱에 실패했습니다.' }, { status: 500 });
  }
}



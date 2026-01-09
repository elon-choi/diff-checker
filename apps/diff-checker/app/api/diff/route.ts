import { NextResponse } from 'next/server';
import { DiffEngine } from '../../../../../packages/core-engine/src/diff-engine';
import { defaultRules } from '../../../../../packages/core-engine/src/rules';
import { SpecNormalizer } from '../../../../../packages/normalizers/spec-normalizer/src/index';
import { FigmaNormalizer } from '../../../../../packages/normalizers/figma-normalizer/src/index';
import { WebNormalizer } from '../../../../../packages/normalizers/web-normalizer/src/index';
import { AndroidNormalizer } from '../../../../../packages/normalizers/android-normalizer/src/index';
import { IOSNormalizer } from '../../../../../packages/normalizers/ios-normalizer/src/index';
import type { SpecItem } from '../../../../../packages/core-engine/src/types';

// 메타데이터 패턴: 비교에서 제외할 텍스트 패턴
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^KWQA-\d+$/i, // 티켓 번호
  /^[0-9]+\/[0-9]+\s+업데이트$/i, // 날짜 업데이트
  /^(Red|Blue|Green|Yellow|Purple|Orange)$/i, // 색상 라벨
  /^목차$/i,
  /^E\.O\.D$/i,
  /^NO$/i,
  /^-$/i,
  /^\.$/i,
  /^,$/i,
  /^~$/i,
  /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/i, // 색상 코드 (#F4F5F7 등)
  /^(true|false|none|null|undefined)$/i, // boolean/null 값
  /^(Document|title|screen|sub|txt|line|Body|Frame|Component|Instance)$/i, // Figma 내부 레이블
];

// 문서 구조 패턴: 비교에서 제외할 섹션 헤더
const DOCUMENT_STRUCTURE_PATTERNS = [
  /^#+\s/, // 마크다운 헤더
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
  
  // 메타데이터 패턴 체크
  for (const pattern of METADATA_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  // 문서 구조 패턴 체크
  for (const pattern of DOCUMENT_STRUCTURE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  
  return false;
}

function deriveSpecItemsFromMarkdown(specText: string): SpecItem[] {
  const lines = specText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: SpecItem[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 1. 따옴표로 감싼 텍스트 추출 (UI 텍스트로 간주)
    const quoted = line.match(/"([^"]+)"/);
    if (quoted) {
      const text = quoted[1];
      // 따옴표 텍스트도 메타데이터인지 확인
      if (!isMetadata(text)) {
        // 헌장 반영: RequirementItem 구조로 해석 (기존 필드 유지)
        items.push({ 
          id: `spec-text-${i}`, 
          kind: 'TEXT', 
          text,
          // 헌장 필드 추가 (optional, 기존 동작 유지)
          intent: `UI 텍스트 "${text}"가 화면에 표시되어야 함`,
          expected: text,
          type: 'UI_TEXT' as any, // 기존 kind 필드와 호환
        });
      }
      continue;
    }
    
    // 2. 가시성 요구사항
    if (line.includes('노출되어야') || line.includes('노출')) {
      // 헌장 반영: RequirementItem 구조로 해석
      items.push({
        id: `spec-visibility-${i}`,
        kind: 'STATE',
        visibility: 'show',
        conditions: { raw: line },
        // 헌장 필드 추가 (optional, 기존 동작 유지)
        intent: '요구사항에 명시된 요소가 화면에 노출되어야 함',
        expected: true,
        type: 'VISIBILITY' as any,
      });
      continue;
    }
    
    // 3. 일반 텍스트는 메타데이터가 아닌 경우만 포함
    if (!isMetadata(line)) {
      // 설명 텍스트 제외: 너무 긴 문장(50자 이상)은 설명으로 간주
      if (line.length > 50) {
        // UI 관련 키워드가 있으면 포함 (설명 중에도 UI 텍스트가 있을 수 있음)
        const uiKeywords = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달', '클릭', '노출'];
        const hasUIKeyword = uiKeywords.some(keyword => line.includes(keyword));
        if (!hasUIKeyword) {
          continue; // 설명 텍스트로 간주하고 제외
        }
      }
      
      // UI 관련 키워드가 있는 경우만 포함
      const uiKeywords = ['버튼', '라벨', '텍스트', '옵션', '선택', '필터', '정렬', '뷰', '화면', '팝업', '모달'];
      const hasUIKeyword = uiKeywords.some(keyword => line.includes(keyword));
      
      // 짧은 텍스트(20자 이하)이거나 UI 키워드가 있는 경우만 포함
      if (hasUIKeyword || (line.length <= 20 && line.length > 2)) {
        // 헌장 반영: RequirementItem 구조로 해석 (기존 필드 유지)
        items.push({ 
          id: `spec-text-${i}`, 
          kind: 'TEXT', 
          text: line,
          // 헌장 필드 추가 (optional, 기존 동작 유지)
          intent: `UI 텍스트 "${line}"가 화면에 표시되어야 함`,
          expected: line,
          type: 'UI_TEXT' as any,
        });
      }
    }
  }
  
  return items;
}

export async function POST(req: Request) {
  try {
    const { phase, specText, figmaJson, webJson, androidJson, iosJson } = await req.json();
    const rules = defaultRules;
    const engine = new DiffEngine(rules);

    const [specDoc, figmaDoc, webDoc, androidDoc, iosDoc] = await Promise.all([
      specText
        ? SpecNormalizer.normalize(specText).catch(() => ({
            platform: 'SPEC' as const,
            source: 'spec.md',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      figmaJson
        ? FigmaNormalizer.normalize(figmaJson).catch(() => ({
            platform: 'FIGMA' as const,
            source: 'figma.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      webJson
        ? WebNormalizer.normalize(webJson).catch(() => ({
            platform: 'WEB' as const,
            source: 'web_dom.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      androidJson
        ? AndroidNormalizer.normalize(androidJson).catch(() => ({
            platform: 'ANDROID' as const,
            source: 'android_dump.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
      iosJson
        ? IOSNormalizer.normalize(iosJson).catch(() => ({
            platform: 'IOS' as const,
            source: 'ios_dump.json',
            capturedAt: new Date().toISOString(),
            nodes: [],
          }))
        : undefined,
    ]);

    const specItems = specText ? deriveSpecItemsFromMarkdown(specText) : [];

    const findings = await engine.runPhase(
      phase as 1 | 2 | 3 | 4,
      {
        spec: specDoc!,
        figma: figmaDoc!,
        web: webDoc,
        android: androidDoc,
        ios: iosDoc,
      },
      specItems
    );
    return NextResponse.json({ findings });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown error' }, { status: 400 });
  }
}




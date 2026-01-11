export type Platform = 'SPEC' | 'FIGMA' | 'WEB' | 'ANDROID' | 'IOS';

export interface SpecItem {
  id: string;
  kind: 'TEXT' | 'CONTROL' | 'POLICY' | 'STATE';
  selector?: string;
  text?: string;
  visibility?: 'show' | 'hide';
  conditions?: Record<string, any>;
  // QA 기준: 요구사항 단위로 처리하기 위한 필드
  intent?: string; // 무엇을 보장해야 하는가 (요구사항 의도)
  expected?: string | boolean; // 예상 값
  scope?: string; // 화면 / 기능 / 조건
  // Phase-2: selectorKey 기반 1:1 매핑
  selectorKey?: string; // 공통 키 (예: "sort.default", "filter.ongoing")
  sectionPath?: string; // 요구사항 그룹 경로 (예: "1. 시간표 탭 내 정렬 > 인기순 세분화")
  // 요구사항 단위 그룹화를 위한 메타 정보
  meta?: {
    section?: string; // 섹션 ID 또는 제목
    row?: number; // 표의 행 번호
    feature?: string; // 기능/요구사항 식별자
    source?: 'table' | 'text' | 'markdown'; // 출처
    isUpdated?: boolean;
    updateDate?: string;
    isDeprecated?: boolean;
    [key: string]: any;
  };
}

export interface UUMNode {
  uid: string;
  platform: Platform;
  role?: string;
  name?: string;
  text?: string;
  selector?: string;
  visible?: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
  meta?: Record<string, any>;
  path?: string;
  // Phase-2: selectorKey 기반 1:1 매핑
  selectorKey?: string; // 공통 키 (Figma에서 파싱)
  figmaPath?: string; // Figma 경로 (디버깅용)
}

export interface UUMDocument {
  platform: Platform;
  source: string;
  capturedAt: string;
  nodes: UUMNode[];
}

export type DecisionReasonCode =
  | 'SPEC_EXTRACT_EMPTY'
  | 'SPEC_FILTERED_OUT'
  | 'SPEC_PRESENT_BUT_NORMALIZATION_FAIL'
  | 'SPEC_CONFIRMED_MISSING'
  | 'FIGMA_ANNOTATION_SUSPECT'
  | 'CONTENT_TEXT';

export interface DiffFinding {
  id: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO' | 'WARN';
  category:
    | 'TEXT_MISMATCH'
    | 'MISSING_ELEMENT'
    | 'VISIBILITY'
    | 'POLICY'
    | 'STRUCTURE';
  description: string;
  evidence: Record<string, any>;
  relatedSpecId?: string;
  // Phase-2: selectorKey 기반 매핑 정보
  selectorKey?: string; // 매핑된 키 (없으면 UNMAPPED)
  diffType?: 'MISSING' | 'CHANGED' | 'EXTRA' | 'POLICY' | 'UNMAPPED'; // Diff 타입
  requirement?: string; // sectionPath
  // 요구사항 단위 그룹화를 위한 메타 정보
  meta?: {
    section?: string;
    row?: number;
    feature?: string;
    ruleName?: string; // 판정 룰 이름
    ruleReason?: string; // 판정 이유
    recommendedAction?: 'spec-update' | 'design-update' | 'ignore-noise'; // 추천 액션
    [key: string]: any;
  };
  // Diff Report Explainability 필드
  specSideEvidence?: {
    spec_section?: string;
    spec_row?: number;
    spec_feature?: string;
    spec_text?: string;
    spec_items_count?: number;
    spec_fulltext_hits?: number;
  };
  figmaSideEvidence?: {
    figma_text?: string;
    figma_page?: string;
    figma_frame_path?: string;
    figma_layer_name?: string;
    figma_text_style?: {
      fontSize?: number;
      color?: string;
      fontWeight?: string;
    };
  };
  matchingEvidence?: {
    match_candidates?: Array<{
      text: string;
      section?: string;
      row?: number;
      similarity: number;
    }>;
  };
  decisionMetadata?: {
    rule_name?: string;
    decision_reason_code?: DecisionReasonCode;
    decision_explanation?: string;
  };
}



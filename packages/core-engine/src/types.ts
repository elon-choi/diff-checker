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
  // 요구사항 단위 그룹화를 위한 메타 정보
  meta?: {
    section?: string; // 섹션 ID 또는 제목
    row?: number; // 표의 행 번호
    feature?: string; // 기능/요구사항 식별자
    source?: 'table' | 'text' | 'markdown'; // 출처
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
}

export interface UUMDocument {
  platform: Platform;
  source: string;
  capturedAt: string;
  nodes: UUMNode[];
}

export interface DiffFinding {
  id: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  category:
    | 'TEXT_MISMATCH'
    | 'MISSING_ELEMENT'
    | 'VISIBILITY'
    | 'POLICY'
    | 'STRUCTURE';
  description: string;
  evidence: Record<string, any>;
  relatedSpecId?: string;
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
}



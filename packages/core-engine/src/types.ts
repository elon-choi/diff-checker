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
}



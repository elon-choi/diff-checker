import { UUMDocument, UUMNode } from '../../../core-engine/src/types';

export const FigmaNormalizer = {
  canHandle: (input: any) =>
    (typeof input === 'object' && input !== null) || typeof input === 'string',
  normalize: async (figmaJson: any): Promise<UUMDocument> => {
    try {
      if (!figmaJson) {
        return {
          platform: 'FIGMA',
          source: 'figma.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      let data: any;
      try {
        data = typeof figmaJson === 'string' ? JSON.parse(figmaJson) : figmaJson;
      } catch (parseError) {
        console.warn('FigmaNormalizer JSON 파싱 실패:', parseError);
        return {
          platform: 'FIGMA',
          source: 'figma.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        };
      }

      const now = new Date().toISOString();
      const nodes: UUMNode[] = [];

      // 디자이너 가이드 텍스트 필터링 (QA 기준: 비교 대상이 아닌 텍스트)
      const isDesignerGuideText = (text: string): boolean => {
        const normalized = text.trim().toLowerCase();

        // 해상도/사이즈 설명 제외 (예: "583 * 300", "321-579")
        if (/^\d+\s*[*x×]\s*\d+$/.test(normalized) || /^\d+-\d+$/.test(normalized)) {
          return true;
        }

        // 폰트/디자인 가이드 제외 (예: "텍스트 크기 30/36", "30/36")
        if (/텍스트\s*크기|font\s*size|^\d+\/\d+$/.test(normalized)) {
          return true;
        }

        // 디자이너 작업 가이드 제외
        const designerGuides = [
          'copy 가능',
          'copy',
          'text',
          'text + image',
          'text+image',
          'image',
          'icon',
          'button',
        ];
        if (designerGuides.includes(normalized)) {
          return true;
        }

        // 샘플/더미 텍스트 제외 (단, 실제 UI 텍스트와 구분 필요)
        // "test", "sample", "dummy", "placeholder"는 단독으로만 사용될 때만 제외
        // (예: "Test Text"는 실제 UI 텍스트일 수 있으므로 제외하지 않음)
        const exactSampleTexts = [
          '일이삼사오육칠팔구십',
          'lorem ipsum',
          'lorem',
          'ipsum',
          'test',
          'sample',
          'dummy',
          'placeholder',
        ];
        // 정확히 일치하는 경우만 제외 (공백 포함 텍스트는 실제 UI 텍스트일 수 있음)
        if (exactSampleTexts.includes(normalized)) {
          return true;
        }

        // 날짜/버전 메모 제외 (예: "26.01.05 update", "2024.01.05")
        if (/^\d{2,4}[.\-/]\d{1,2}[.\-/]\d{1,2}.*update$/i.test(normalized) ||
            /^\d{2,4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/.test(normalized)) {
          return true;
        }

        // 구조/레이어 명칭 제외
        const structureNames = [
          'frame',
          'component',
          'group',
          'document',
          'instance',
          'layer',
          'vector',
          'rectangle',
          'ellipse',
        ];
        if (structureNames.includes(normalized)) {
          return true;
        }

        return false;
      };

      const pushNode = (node: any, path: string, idx: number) => {
        // TEXT 노드만 추출 (실제 화면에 표시되는 텍스트)
        if (node.type !== 'TEXT' || !node.characters) {
          return; // 구조 노드는 제외
        }

        // visible이 false인 노드는 제외 (화면에 보이지 않는 노드)
        if (node.visible === false) {
          return;
        }

        // 디자이너 가이드 텍스트 제외 (QA 기준)
        if (isDesignerGuideText(node.characters)) {
          return;
        }

        // 실제 UI 텍스트만 포함 (레이어 이름은 제외)
        nodes.push({
          uid: node.id ? String(node.id) : `figma-${idx}`,
          platform: 'FIGMA',
          role: 'TEXT', // TEXT 노드만 추출하므로 role을 TEXT로 고정
          text: node.characters, // 실제 UI 텍스트만 사용 (name 제외)
          selector: path,
          visible: true, // TEXT 노드이고 visible이 false가 아니므로 true
          bounds: node.absoluteBoundingBox
            ? {
                x: node.absoluteBoundingBox.x ?? 0,
                y: node.absoluteBoundingBox.y ?? 0,
                w: node.absoluteBoundingBox.width ?? 0,
                h: node.absoluteBoundingBox.height ?? 0,
              }
            : undefined,
          meta: { rawType: node.type },
          path,
        });
      };

      // 형식 1: 단순 Content 배열 형식 처리 (Plugin에서 추출한 경우)
      // 예: [{ "Content": "텍스트1" }, { "Content": "텍스트2" }]
      if (Array.isArray(data) && data.length > 0 && data[0]?.Content) {
        data.forEach((item: any, idx: number) => {
          const content = item.Content || item.content || item.text || item.Text;
          if (typeof content === 'string' && content.trim()) {
            const text = content.trim();
            // 디자이너 가이드 텍스트 필터링
            if (!isDesignerGuideText(text)) {
              nodes.push({
                uid: `figma-content-${idx}`,
                platform: 'FIGMA',
                role: 'TEXT',
                text: text,
                selector: `/figma/content/${idx}`,
                visible: true,
                meta: { rawType: 'CONTENT', source: 'plugin-export' },
                path: `/figma/content/${idx}`,
              });
            }
          }
        });
      } else {
        // 형식 2: 표준 Figma API 형식 처리
        const walk = (node: any, path: string) => {
          if (!node) return;
          if (Array.isArray(node)) {
            node.forEach((child, i) => walk(child, `${path}/${i}`));
            return;
          }
          const idx = nodes.length;
          pushNode(node, path, idx);
          if (node.children && Array.isArray(node.children)) {
            node.children.forEach((child: any, i: number) =>
              walk(child, `${path}/children/${i}`)
            );
          }
        };

        walk(data.document ?? data, '/figma');
      }

      return {
        platform: 'FIGMA',
        source: 'figma.json',
        capturedAt: now,
        nodes,
      };
    } catch (error) {
      console.warn('FigmaNormalizer 실패, 빈 문서 반환:', error);
      return {
        platform: 'FIGMA',
        source: 'figma.json',
        capturedAt: new Date().toISOString(),
        nodes: [],
      };
    }
  },
};

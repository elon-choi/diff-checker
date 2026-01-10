import { readFileSync } from 'fs';
import { join } from 'path';
import { SpecNormalizer } from '../packages/normalizers/spec-normalizer/src/index';

async function testUpdateParsing() {
  const specPath = join(__dirname, '../resources/samples/spec-with-updates.md');
  const specText = readFileSync(specPath, 'utf-8');

  console.log('=== 테스트 문서 내용 ===\n');
  console.log(specText);
  console.log('\n=== 파싱 결과 ===\n');

  const doc = await SpecNormalizer.normalize(specText);

  console.log(`총 ${doc.nodes.length}개 노드 파싱됨\n`);

  // 취소선 처리된 항목 확인
  const deprecatedNodes = doc.nodes.filter(n => n.meta?.isDeprecated);
  console.log(`📌 취소선 처리된 항목 (${deprecatedNodes.length}개):`);
  deprecatedNodes.forEach((node, idx) => {
    console.log(`  ${idx + 1}. [취소됨] ${node.meta?.originalText}`);
    console.log(`     → 파싱된 텍스트: "${node.text}"`);
  });

  console.log('\n');

  // 업데이트된 항목 확인
  const updatedNodes = doc.nodes.filter(n => n.meta?.isUpdated);
  console.log(`📌 업데이트된 항목 (${updatedNodes.length}개):`);
  updatedNodes.forEach((node, idx) => {
    console.log(`  ${idx + 1}. [업데이트: ${node.meta?.updateDate}] ${node.meta?.originalText}`);
    console.log(`     → 파싱된 텍스트: "${node.text}"`);
  });

  console.log('\n');

  // 일반 항목 확인 (비교 대상)
  const normalNodes = doc.nodes.filter(
    n => !n.meta?.isDeprecated && !n.meta?.isUpdated && n.text && n.text.length > 2
  );
  console.log(`📌 일반 항목 (비교 대상, ${normalNodes.length}개):`);
  normalNodes.slice(0, 10).forEach((node, idx) => {
    console.log(`  ${idx + 1}. "${node.text}"`);
  });
  if (normalNodes.length > 10) {
    console.log(`  ... 외 ${normalNodes.length - 10}개`);
  }

  console.log('\n=== 요약 ===');
  console.log(`- 총 노드: ${doc.nodes.length}`);
  console.log(`- 취소선 처리 (비교 제외): ${deprecatedNodes.length}`);
  console.log(`- 업데이트 표시: ${updatedNodes.length}`);
  console.log(`- 일반 항목 (비교 대상): ${normalNodes.length}`);
}

testUpdateParsing().catch(console.error);

import { readFileSync } from 'fs';
import { extractSpecItemsFromTables } from '../apps/diff-checker/lib/table-parser';
import { isNoiseSpecItem, isNoise } from '../apps/diff-checker/lib/noise-filter';
import { LLMAdapter } from '../packages/adapters/llm-adapter/src/index';

async function run() {
  const html = readFileSync('/Users/kakaoent/spec-diff-checker/DiffChecker/.tmp/spec-check.html', 'utf8');
  let specItems = (await extractSpecItemsFromTables(html)).items;
  let validSpecItems = specItems.filter(item => !isNoiseSpecItem(item));
  let textSpecItems = validSpecItems.filter(item => item.kind === 'TEXT' && item.text);
  console.log('before_textSpecItems', textSpecItems.length);

  (LLMAdapter as any).extractSpecTexts = async () => ['추가 문구1', '추가 문구2', '추가 문구3', '추가 문구4'];
  const extractedTexts: string[] = await (LLMAdapter as any).extractSpecTexts(html);
  const dedupedTexts = Array.from(new Set(extractedTexts.map(text => text.trim()).filter(Boolean)));
  const existingTextSet = new Set(
    specItems
      .map(item => item.text?.trim().toLowerCase())
      .filter((text): text is string => Boolean(text))
  );

  const extractedItems = dedupedTexts
    .filter(text => !isNoise(text) && text.length >= 2 && text.length <= 100)
    .filter(text => !existingTextSet.has(text.toLowerCase()))
    .map((text, index) => ({
      id: `spec-llm-augment-${index}`,
      kind: 'TEXT' as const,
      text,
      meta: {
        source: 'text' as const,
        column: 'content',
        extraction: 'llm',
      },
    }));

  specItems = [...specItems, ...extractedItems];
  validSpecItems = specItems.filter(item => !isNoiseSpecItem(item));
  textSpecItems = validSpecItems.filter(item => item.kind === 'TEXT' && item.text);

  console.log('after_textSpecItems', textSpecItems.length);
  console.log('augmented_added', extractedItems.length);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

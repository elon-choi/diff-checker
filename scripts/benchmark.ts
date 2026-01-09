import { performance } from 'perf_hooks';
import { promises as fs } from 'fs';
import path from 'path';
import { DiffEngine } from '../packages/core-engine/src/diff-engine';
import { defaultRules } from '../packages/core-engine/src/rules';
import { SpecNormalizer } from '../packages/normalizers/spec-normalizer/src/index';
import { FigmaNormalizer } from '../packages/normalizers/figma-normalizer/src/index';
import { WebNormalizer } from '../packages/normalizers/web-normalizer/src/index';
import type { SpecItem } from '../packages/core-engine/src/types';

function deriveSpecItemsFromMarkdown(specText: string): SpecItem[] {
  const lines = specText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: SpecItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoted = line.match(/"([^"]+)"/);
    if (quoted) {
      items.push({
        id: `spec-text-${i}`,
        kind: 'TEXT',
        text: quoted[1],
      });
      continue;
    }
    if (line.includes('노출되어야')) {
      items.push({
        id: `spec-visibility-${i}`,
        kind: 'STATE',
        visibility: 'show',
        conditions: { raw: line },
      });
    } else {
      items.push({
        id: `spec-text-${i}`,
        kind: 'TEXT',
        text: line,
      });
    }
  }
  return items;
}

async function benchmark() {
  const cwd = process.cwd();
  const iterations = 10;

  console.log('성능 벤치마크 시작...\n');

  const specPath = path.resolve(cwd, 'resources/samples/spec.md');
  const figmaPath = path.resolve(cwd, 'resources/samples/figma.json');
  const webPath = path.resolve(cwd, 'resources/samples/web_dom.json');

  const [specMd, figmaJson, webJson] = await Promise.all([
    fs.readFile(specPath, 'utf-8'),
    fs.readFile(figmaPath, 'utf-8'),
    fs.readFile(webPath, 'utf-8'),
  ]);

  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    const [specDoc, figmaDoc, webDoc] = await Promise.all([
      SpecNormalizer.normalize(specMd),
      FigmaNormalizer.normalize(figmaJson),
      WebNormalizer.normalize(JSON.parse(webJson)),
    ]);

    const specItems = deriveSpecItemsFromMarkdown(specMd);

    const engine = new DiffEngine(defaultRules);
    const findings = await engine.runPhase(
      2,
      {
        spec: specDoc,
        figma: figmaDoc,
        web: webDoc,
      },
      specItems
    );

    const end = performance.now();
    const duration = end - start;
    times.push(duration);

    if (i === 0) {
      console.log(`첫 실행 결과: ${findings.length}건의 findings 발견`);
    }
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`\n성능 측정 결과 (${iterations}회 실행):`);
  console.log(`  평균: ${avg.toFixed(2)}ms (${(avg / 1000).toFixed(3)}초)`);
  console.log(`  최소: ${min.toFixed(2)}ms (${(min / 1000).toFixed(3)}초)`);
  console.log(`  최대: ${max.toFixed(2)}ms (${(max / 1000).toFixed(3)}초)`);
  console.log(`\n목표: ≤ 3000ms (3초)`);
  
  if (avg <= 3000) {
    console.log('✅ 목표 달성!');
  } else {
    console.log(`❌ 목표 미달성 (${((avg - 3000) / 1000).toFixed(2)}초 초과)`);
  }
}

benchmark().catch(console.error);



import { promises as fs } from 'fs';
import path from 'path';
import { DiffEngine, DiffRule } from '../../../packages/core-engine/src/diff-engine';
import { DiffFinding, SpecItem, UUMDocument } from '../../../packages/core-engine/src/types';
import { SpecNormalizer } from '../../../packages/normalizers/spec-normalizer/src/index';
import { FigmaNormalizer } from '../../../packages/normalizers/figma-normalizer/src/index';
import { WebNormalizer } from '../../../packages/normalizers/web-normalizer/src/index';
import { AndroidNormalizer } from '../../../packages/normalizers/android-normalizer/src/index';
import { IOSNormalizer } from '../../../packages/normalizers/ios-normalizer/src/index';
import { toMarkdown } from '../../../packages/reporters/markdown-reporter/src/index';
import { StorageAdapter } from '../../../packages/adapters/storage-adapter/src/index';
import { LLMAdapter } from '../../../packages/adapters/llm-adapter/src/index';
import {
  textStrictRule,
  missingElementRule,
  visibilityRule,
  policyRule,
  structureRule,
} from '../../../packages/core-engine/src/rules';

type ProjectConfig = {
  phase: 1 | 2 | 3 | 4;
  spec: string;
  figma: string;
  web?: string;
  android?: string;
  ios?: string;
  rules?: { include?: string[] };
};

async function readText(absPath: string): Promise<string> {
  return fs.readFile(absPath, 'utf-8');
}

function parseSimpleYaml(yamlText: string): ProjectConfig {
  const lines = yamlText.split('\n').map(l => l.replace(/\r$/, ''));
  const cfg: any = {};
  let currentKey: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.includes(':') && !line.startsWith('-')) {
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (v) {
        cfg[k.trim()] = isNaN(Number(v)) ? v : Number(v);
        currentKey = null;
      } else {
        cfg[k.trim()] = {};
        currentKey = k.trim();
      }
      continue;
    }
    if (line.startsWith('-') && currentKey) {
      const arrKey = Object.keys(cfg[currentKey] ?? {}).at(-1) ?? 'include';
      if (!cfg[currentKey][arrKey]) cfg[currentKey][arrKey] = [];
      cfg[currentKey][arrKey].push(line.replace(/^-/, '').trim());
    } else if (currentKey && line.includes(':')) {
      const [k2, ...rest2] = line.split(':');
      const v2 = rest2.join(':').trim();
      cfg[currentKey][k2.trim()] = v2 || {};
    }
  }
  // Normalize types
  if (typeof cfg.phase === 'string') cfg.phase = Number(cfg.phase);
  return cfg as ProjectConfig;
}

function deriveSpecItemsFromMarkdown(specText: string): SpecItem[] {
  const lines = specText.split('\n').map(l => l.trim()).filter(Boolean);
  const items: SpecItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoted = line.match(/"([^"]+)"/);
    if (quoted) {
      items.push({
        id: `spec-text-${i}`,
        kind: 'TEXT',
        text: quoted[1]
      });
      continue;
    }
    if (line.includes('노출되어야')) {
      items.push({
        id: `spec-visibility-${i}`,
        kind: 'STATE',
        visibility: 'show',
        conditions: { raw: line }
      });
    } else {
      items.push({
        id: `spec-text-${i}`,
        kind: 'TEXT',
        text: line
      });
    }
  }
  return items;
}

// 규칙은 core-engine 제공 버전을 사용한다.

async function main() {
  const cwd = process.cwd();
  console.log('Diff Checker CLI 초기화됨.');

  const projectConfigPath = path.resolve(cwd, 'configs/project.config.yaml');
  const yamlText = await readText(projectConfigPath);
  const config = parseSimpleYaml(yamlText);

  if (config.phase < 1 || config.phase > 4) {
    throw new Error(`지원하지 않는 phase: ${config.phase}`);
  }

  const specPath = path.resolve(cwd, config.spec);
  const figmaPath = path.resolve(cwd, config.figma);
  const webPath = config.web ? path.resolve(cwd, config.web) : undefined;
  const androidPath = config.android ? path.resolve(cwd, config.android) : undefined;
  const iosPath = config.ios ? path.resolve(cwd, config.ios) : undefined;

  const [specMd, figmaJson, webJson, androidJson, iosJson] = await Promise.all([
    readText(specPath),
    readText(figmaPath),
    webPath ? readText(webPath) : Promise.resolve(undefined),
    androidPath ? readText(androidPath) : Promise.resolve(undefined),
    iosPath ? readText(iosPath) : Promise.resolve(undefined),
  ]);

  const [specDoc, figmaDoc, webDoc, androidDoc, iosDoc] = await Promise.all([
    SpecNormalizer.normalize(specMd).catch(() => ({
      platform: 'SPEC' as const,
      source: 'spec.md',
      capturedAt: new Date().toISOString(),
      nodes: [],
    })),
    FigmaNormalizer.normalize(figmaJson).catch(() => ({
      platform: 'FIGMA' as const,
      source: 'figma.json',
      capturedAt: new Date().toISOString(),
      nodes: [],
    })),
    webJson
      ? WebNormalizer.normalize(JSON.parse(webJson)).catch(() => ({
          platform: 'WEB' as const,
          source: 'web_dom.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        }))
      : Promise.resolve(undefined as any),
    androidJson
      ? AndroidNormalizer.normalize(JSON.parse(androidJson)).catch(() => ({
          platform: 'ANDROID' as const,
          source: 'android_dump.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        }))
      : Promise.resolve(undefined as any),
    iosJson
      ? IOSNormalizer.normalize(JSON.parse(iosJson)).catch(() => ({
          platform: 'IOS' as const,
          source: 'ios_dump.json',
          capturedAt: new Date().toISOString(),
          nodes: [],
        }))
      : Promise.resolve(undefined as any),
  ]);

  const specItems = deriveSpecItemsFromMarkdown(specMd);

  const rulesToUse = (config.rules?.include ?? ['text.strict', 'missing.element', 'visibility.requirement', 'policy.basic', 'structure.basic'])
    .map(id =>
      id === 'text.strict' ? textStrictRule
      : id === 'missing.element' ? missingElementRule
      : id === 'visibility.requirement' ? visibilityRule
      : id === 'policy.basic' ? policyRule
      : id === 'structure.basic' ? structureRule
      : null
    )
    .filter(Boolean) as DiffRule[];

  const engine = new DiffEngine(rulesToUse, LLMAdapter);
  const findings = await engine.runPhase(
    config.phase,
    {
      spec: specDoc,
      figma: figmaDoc,
      web: config.phase >= 2 ? webDoc : undefined,
      android: config.phase >= 3 ? androidDoc : undefined,
      ios: config.phase >= 4 ? iosDoc : undefined,
    },
    specItems
  );

  const report = toMarkdown(findings as any, config.phase);
  const outPath = path.resolve(cwd, `reports/phase-${config.phase}.md`);
  await StorageAdapter.writeText(outPath, report);

  console.log(`Phase ${config.phase} Diff 완료. 결과: ${findings.length}건`);
  console.log(`보고서: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});



#!/usr/bin/env node
/**
 * storyboard.json → 전 산출물.
 *   node build-storyboard.mjs <dir> [--panels] [--force-panels] [--no-png] [--panel-cmd <명령>]
 * exit 0 성공 (패널·PNG 실패는 경고) · 1 검증 실패 · 2 사용법/파싱 오류
 *
 * 특정 AI 서비스에 묶이지 않는다. Node 20+ 만 있으면 에이전트 없이도 돈다.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStoryboard } from './lib/validate.mjs';
import { resolveProfile, BUILTIN_PROFILES } from './lib/profile.mjs';
import { renderH3Prompt } from './lib/render-h3.mjs';
import { renderPanelPromptsText } from './lib/render-panels.mjs';
import { renderAss } from './lib/render-ass.mjs';
import { renderBurnPs1 } from './lib/render-burn.mjs';
import { renderStoryboardMd } from './lib/render-md.mjs';
import { renderContiSheet } from './lib/render-sheet.mjs';
import { generatePanels } from './lib/panel-backend.mjs';
import { captureSheetPng, sheetHeight } from './lib/sheet-png.mjs';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM

const args = process.argv.slice(2);
// --panel-cmd 는 값을 하나 먹는다. `--panel-cmd=…` 형태도 받는다.
const consumed = new Set();
/** 값을 하나 먹는 옵션. `--opt 값` 과 `--opt=값` 둘 다 받는다. */
function valueOption(name) {
  const i = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (i === -1) return undefined;
  consumed.add(i);
  if (args[i].includes('=')) return args[i].split('=').slice(1).join('=');
  consumed.add(i + 1);
  return args[i + 1];
}
const panelCmd = valueOption('--panel-cmd');
const profileArg = valueOption('--profile');
const flags = new Set(args.filter((a, i) => a.startsWith('--') && !consumed.has(i)));
const dirArg = args.find((a, i) => !a.startsWith('--') && !consumed.has(i));

if (!dirArg) {
  console.error('사용: node build-storyboard.mjs <출력 디렉터리> [옵션]');
  console.error('  <출력 디렉터리>/storyboard.json 을 읽어 산출물을 같은 폴더에 쓴다.');
  console.error('');
  console.error('  --no-png            콘티 시트 PNG 캡처를 건너뛴다');
  console.error('  --panels            콘티 패널 이미지를 생성한다 (패널당 1~2분)');
  console.error('  --force-panels      이미 있는 패널도 다시 만든다');
  console.error('  --panel-cmd <명령>   패널을 만들 CLI 템플릿. {prompt} 자리에 지시문이 들어간다.');
  console.error('                      생략하면 codex 프리셋. 환경변수 BOOK_SHORTS_PANEL_CMD 로도 지정.');
  console.error(`  --profile <이름|경로> 자막 좌표 프로파일. 내장: ${Object.keys(BUILTIN_PROFILES).join(', ')}`);
  console.error('                      생략하면 storyboard.json 의 delivery 필드, 그것도 없으면 기본값.');
  process.exit(2);
}

const dir = resolve(dirArg);
const sbPath = join(dir, 'storyboard.json');
if (!existsSync(sbPath)) {
  console.error(`storyboard.json 없음: ${sbPath}`);
  process.exit(2);
}

let sb;
try {
  sb = JSON.parse(readFileSync(sbPath, 'utf8'));
} catch (e) {
  console.error(`storyboard.json JSON 파싱 실패: ${e.message}`);
  process.exit(2);
}

let profile;
try {
  profile = resolveProfile({ cli: profileArg, storyboard: sb });
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

const evidence = JSON.parse(readFileSync(join(SKILL_ROOT, 'references', 'evidence.json'), 'utf8'));
const template = readFileSync(join(SKILL_ROOT, 'templates', 'contisheet.html'), 'utf8');
const write = (name, text, { bom = false } = {}) => writeFileSync(join(dir, name), (bom ? BOM : '') + text, 'utf8');

// 1. 검증 — 실패하면 리포트만 남기고 중단 (반쪽 산출물을 남기지 않는다)
const report = validateStoryboard(sb, evidence, { renderPrompt: (x) => renderH3Prompt(x, profile), profile });
// 프로파일 자체의 문제(낮은 명암비 등)는 검증을 막지 않는다. 고른 사람이 알고 고르게만 한다.
for (const w of profile.warnings) report.warnings.push({ rule: 'PROFILE', message: w });
if (!report.ok) {
  write('build-report.json', JSON.stringify(report, null, 2));
  console.error(`검증 실패 (${report.errors.length}건):`);
  for (const e of report.errors) console.error(`  [${e.rule}] ${e.message}`);
  for (const w of report.warnings) console.error(`  (경고 ${w.rule}) ${w.message}`);
  process.exit(1);
}

// 2. 텍스트 산출물
write('h3-prompt.txt', renderH3Prompt(sb, profile));
write('panel-prompts.txt', renderPanelPromptsText(sb));
write('subtitles.ass', renderAss(sb, profile), { bom: true });
write('burn.ps1', renderBurnPs1(profile), { bom: true });

// 3. 패널 (선택) — codex exec 1회
if (flags.has('--panels')) {
  console.log('콘티 패널 생성 중 (수 분 소요)…');
  report.panels = generatePanels(dir, sb, { force: flags.has('--force-panels'), skillRoot: SKILL_ROOT, cli: panelCmd });
  const p = report.panels;
  if (p.ran) {
    console.log(`  백엔드: ${p.backend}`);
    console.log(`  생성 ${p.generated.length} · 건너뜀 ${p.skipped.length} · 누락 ${p.missing.length}${p.error ? ` · 오류: ${p.error}` : ''}`);
    if (p.hint) console.log(`  ${p.hint}`);
  } else {
    console.log(`  전 패널 이미 존재 (건너뜀 ${p.skipped.length}). 다시 만들려면 --force-panels`);
  }
  if (p.missing.length) report.warnings.push({ rule: 'PANELS', message: `누락 패널: ${p.missing.join(', ')} — 시트는 플레이스홀더로 채움` });
}

// 4. 콘티 시트
const panelExists = (file) => existsSync(join(dir, file));
write('contisheet.html', renderContiSheet(sb, template, { panelExists, evidence, profile }));
if (!flags.has('--no-png')) {
  const png = captureSheetPng(join(dir, 'contisheet.html'), join(dir, 'contisheet.png'), sheetHeight(sb.panels.length));
  report.sheetPng = png;
  if (!png.ok) report.warnings.push({ rule: 'SHEET_PNG', message: `contisheet.png 생략 (${png.reason}) — contisheet.html을 브라우저로 열어 확인` });
}

// 5. 기획서 + 리포트
write('storyboard.md', renderStoryboardMd(sb, report, evidence));
write('build-report.json', JSON.stringify(report, null, 2));

console.log(`검증 통과 · 내레이션 ${report.metrics.syllables}음절 · 큐 ${report.metrics.cues} · 샷 ${report.metrics.shots} · 패널 ${report.metrics.panels} · 프롬프트 ${report.metrics.promptChars}자`);
console.log(`프로파일 ${profile.name} (${profile.source}) · ${profile.canvas.width}×${profile.canvas.height} · 자막 ${profile.subtitle.font} ${profile.subtitle.size}px ${profile.subtitle.color}/${profile.subtitle.outlineColor} · 줄당 ${profile.derived.maxLineLen}자`);
for (const w of report.warnings) console.log(`  (경고 ${w.rule}) ${w.message}`);
console.log(`산출물: ${dir}`);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PANEL_BACKENDS,
  INSTRUCTION_FILE,
  CONFIG_FILE,
  resolvePanelCommand,
  buildCommand,
  buildPanelInstruction,
  generatePanels,
} from './panel-backend.mjs';
import { renderPanelPrompts } from './render-panels.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const tmp = () => mkdtempSync(join(tmpdir(), 'panels-'));

test('프리셋은 검증된 것만 싣는다 — 확인 안 한 CLI 플래그를 지어내지 않는다', () => {
  assert.deepEqual(Object.keys(PANEL_BACKENDS), ['codex']);
  assert.ok(PANEL_BACKENDS.codex.includes('{prompt}'));
  assert.ok(PANEL_BACKENDS.codex.includes('service_tier=fast'));
});

test('resolvePanelCommand 우선순위: CLI > env > 설정파일 > 기본 프리셋', () => {
  const skillRoot = tmp();
  // 4. 아무것도 없으면 기본 프리셋
  let r = resolvePanelCommand({ skillRoot, env: {} });
  assert.equal(r.template, PANEL_BACKENDS.codex);
  assert.equal(r.source, 'default:codex');

  // 3. 설정 파일
  writeFileSync(join(skillRoot, CONFIG_FILE), JSON.stringify({ command: 'myagent run {prompt}' }));
  r = resolvePanelCommand({ skillRoot, env: {} });
  assert.equal(r.template, 'myagent run {prompt}');
  assert.equal(r.source, CONFIG_FILE);

  // 2. 환경변수가 설정파일을 이긴다
  r = resolvePanelCommand({ skillRoot, env: { BOOK_SHORTS_PANEL_CMD: 'envagent {prompt}' } });
  assert.equal(r.template, 'envagent {prompt}');
  assert.equal(r.source, 'env:BOOK_SHORTS_PANEL_CMD');

  // 1. CLI가 전부를 이긴다
  r = resolvePanelCommand({ skillRoot, env: { BOOK_SHORTS_PANEL_CMD: 'envagent {prompt}' }, cli: 'cliagent {prompt}' });
  assert.equal(r.template, 'cliagent {prompt}');
  assert.equal(r.source, '--panel-cmd');
});

test('프리셋 이름으로도 지정할 수 있다', () => {
  const r = resolvePanelCommand({ skillRoot: tmp(), env: {}, cli: 'codex' });
  assert.equal(r.template, PANEL_BACKENDS.codex);
  assert.equal(r.source, '--panel-cmd:codex');
});

test('{prompt}가 없는 템플릿은 뒤에 붙인다', () => {
  assert.equal(buildCommand('myagent run', 'HI'), 'myagent run "HI"');
  assert.equal(buildCommand('myagent {prompt} --json', 'HI'), 'myagent "HI" --json');
});

test('지시문: 이미지 생성 지시·세로·패널별 파일 경로·프롬프트', () => {
  const jobs = renderPanelPrompts(fixture);
  const s = buildPanelInstruction(jobs);
  assert.ok(s.includes('VERTICAL PORTRAIT'));
  assert.ok(s.includes('image generation'));
  for (const j of jobs) {
    assert.ok(s.includes(`### ${j.file}`));
    assert.ok(s.includes(j.prompt));
  }
});

test('generatePanels: 지시문 파일을 쓰고 runner를 cwd=dir로 호출, 생성/누락을 보고', () => {
  const dir = tmp();
  const calls = [];
  const runner = (command, cwd) => {
    calls.push({ command, cwd });
    mkdirSync(join(cwd, 'panels'), { recursive: true });
    writeFileSync(join(cwd, 'panels/panel-01.png'), 'x');
    writeFileSync(join(cwd, 'panels/panel-02.png'), 'x');
    return { status: 0, stdout: '', stderr: '' };
  };
  const r = generatePanels(dir, fixture, { runner, skillRoot: tmp(), env: {} });
  assert.equal(r.ran, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, dir);
  assert.ok(calls[0].command.includes(INSTRUCTION_FILE));
  assert.ok(existsSync(join(dir, INSTRUCTION_FILE)));
  assert.equal(r.backend, 'default:codex');
  assert.deepEqual(r.generated, ['panels/panel-01.png', 'panels/panel-02.png']);
  assert.deepEqual(r.missing, ['panels/panel-03.png', 'panels/panel-04.png', 'panels/panel-05.png']);
});

test('generatePanels: 커스텀 백엔드 명령이 그대로 실행된다', () => {
  const dir = tmp();
  let seen = '';
  const runner = (command) => { seen = command; return { status: 0, stdout: '', stderr: '' }; };
  const r = generatePanels(dir, fixture, { runner, skillRoot: tmp(), env: {}, cli: 'myagent --file {prompt}' });
  assert.ok(seen.startsWith('myagent --file "'));
  assert.equal(r.backend, '--panel-cmd');
});

test('generatePanels: 이미 있는 패널은 건너뛴다, force면 다시', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'panels'));
  for (const n of ['01', '02', '03', '04', '05']) writeFileSync(join(dir, `panels/panel-${n}.png`), 'x');
  let called = 0;
  const runner = () => { called++; return { status: 0, stdout: '', stderr: '' }; };
  const opts = { runner, skillRoot: tmp(), env: {} };
  const r = generatePanels(dir, fixture, opts);
  assert.equal(r.ran, false);
  assert.equal(called, 0);
  assert.equal(r.skipped.length, 5);
  const f = generatePanels(dir, fixture, { ...opts, force: true });
  assert.equal(f.ran, true);
  assert.equal(called, 1);
});

test('generatePanels: 실행 파일이 없으면 설정 방법을 알려준다', () => {
  const dir = tmp();
  const runner = () => ({ status: null, stdout: '', stderr: '', error: new Error('spawnSync codex ENOENT') });
  const r = generatePanels(dir, fixture, { runner, skillRoot: tmp(), env: {} });
  assert.ok(r.error.includes('ENOENT'));
  assert.ok(r.hint.includes('--panel-cmd'));
  assert.ok(r.hint.includes('panel-prompts.txt'));
  assert.equal(r.missing.length, 5);
});

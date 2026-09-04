import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BUILTIN_PROFILES, DEFAULT_PROFILE, resolveProfile } from './profile.mjs';

test('내장 프로파일: 범용이 기본, 앱별은 예시로 함께 싣는다', () => {
  assert.deepEqual(Object.keys(BUILTIN_PROFILES).sort(), ['generic-9x16', 'ttokttok']);
  assert.equal(DEFAULT_PROFILE, 'generic-9x16');
});

test('줄당 글자수는 좌표에서 유도된다 — 따로 적어두지 않는다', () => {
  // ttokttok: (1440 - 288*2) / 72 = 12
  const t = resolveProfile({ name: 'ttokttok' });
  assert.equal(t.subtitle.marginX, 288);
  assert.equal(t.subtitle.size, 72);
  assert.equal(t.derived.usableWidth, 864);
  assert.equal(t.derived.maxLineLen, 12);

  // generic: (1080 - 130*2) / 54 = 15
  const g = resolveProfile({ name: 'generic-9x16' });
  assert.equal(g.derived.maxLineLen, 15);
});

test('구도 세이프 비율도 크롭에서 유도된다', () => {
  const t = resolveProfile({ name: 'ttokttok' });
  assert.equal(t.framing.cropPerSide, 0.06);
  assert.equal(t.derived.safeCenterPct, 88); // (1 - 0.06*2) * 100

  // 크롭이 없으면 구도 지시 자체를 넣지 않는다 — "중앙 100%"는 무의미하다
  const g = resolveProfile({ name: 'generic-9x16' });
  assert.equal(g.framing.cropPerSide, 0);
  assert.equal(g.derived.safeCenterPct, null);
});

test('storyboard.json 의 delivery 필드로 프로파일을 고른다', () => {
  const p = resolveProfile({ storyboard: { delivery: 'ttokttok' } });
  assert.equal(p.name, 'ttokttok');
});

test('delivery 에 객체를 주면 내장 프로파일 위에 병합된다', () => {
  const p = resolveProfile({
    storyboard: { delivery: { base: 'ttokttok', subtitle: { size: 96 } } },
  });
  assert.equal(p.subtitle.size, 96);
  assert.equal(p.subtitle.marginX, 288);       // 병합되지 않은 값은 유지
  assert.equal(p.derived.maxLineLen, 9);       // 864 / 96 = 9 — 유도값이 따라온다
});

test('base 없이 객체만 주면 기본 프로파일 위에 병합', () => {
  const p = resolveProfile({ storyboard: { delivery: { canvas: { width: 720, height: 1280 } } } });
  assert.equal(p.canvas.width, 720);
  assert.equal(p.subtitle.font, BUILTIN_PROFILES['generic-9x16'].subtitle.font);
});

test('CLI 지정이 storyboard 보다 우선한다', () => {
  const p = resolveProfile({ cli: 'generic-9x16', storyboard: { delivery: 'ttokttok' } });
  assert.equal(p.name, 'generic-9x16');
});

test('CLI 로 JSON 파일 경로를 줄 수 있다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prof-'));
  const file = join(dir, 'my.json');
  writeFileSync(file, JSON.stringify({ base: 'ttokttok', subtitle: { font: 'Noto Sans KR' } }));
  const p = resolveProfile({ cli: file });
  assert.equal(p.subtitle.font, 'Noto Sans KR');
  assert.equal(p.subtitle.marginX, 288);
  assert.equal(p.source, file);
});

test('없는 프로파일 이름은 던진다 — 조용히 기본으로 가지 않는다', () => {
  assert.throws(() => resolveProfile({ cli: 'nope' }), /nope/);
});

test('아무것도 안 주면 기본 프로파일', () => {
  const p = resolveProfile({});
  assert.equal(p.name, DEFAULT_PROFILE);
  assert.equal(p.source, `builtin:${DEFAULT_PROFILE}`);
});

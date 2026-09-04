import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAss } from './render-ass.mjs';
import { renderBurnPs1 } from './render-burn.mjs';
import { resolveProfile } from './profile.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const ttok = resolveProfile({ name: 'ttokttok' });
const ass = renderAss(fixture, ttok);

test('헤더: 프로파일의 캔버스가 PlayRes로 들어간다', () => {
  assert.ok(ass.startsWith('[Script Info]'));
  assert.ok(ass.includes('PlayResX: 1440'));
  assert.ok(ass.includes('PlayResY: 2560'));
});

test('스타일 2개: Sub(하단 중앙, 마진 288/384) · Title(정중앙)', () => {
  assert.ok(ass.includes('Style: Sub,Malgun Gothic,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,6,0,2,288,288,384,1'));
  assert.ok(ass.includes('Style: Title,Malgun Gothic,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,8,0,5,288,288,0,1'));
});

test('애니메이션: 기본은 페이드, 큐마다 태그가 붙는다', () => {
  assert.ok(ass.includes(',Sub,,0,0,0,,{\\fad(120,120)}아침에 눈을 떴는데'));
  assert.ok(ass.includes(',Title,,0,0,0,,{\\fad(200,200)}변신 · 프란츠 카프카'));
});

test('애니메이션: none 이면 태그가 아예 없다 — 예전 출력 그대로', () => {
  const out = renderAss(fixture, resolveProfile({
    storyboard: { delivery: { base: 'ttokttok', motion: { subtitle: { type: 'none' }, titleCard: { type: 'none' } } } },
  }));
  assert.ok(!out.includes('{\\'));
  assert.ok(out.includes(',Sub,,0,0,0,,아침에 눈을 떴는데'));
});

test('애니메이션: slide-up 은 정렬에서 계산한 앵커로 움직인다', () => {
  const out = renderAss(fixture, resolveProfile({
    storyboard: { delivery: { base: 'ttokttok', motion: { subtitle: { type: 'slide-up', inMs: 200, outMs: 120, distance: 40 } } } },
  }));
  // ttokttok bottom-center: x=720, y=2560-384=2176
  assert.ok(out.includes('{\\fad(200,120)\\move(720,2216,720,2176,0,200)}아침에'));
});

test('애니메이션: 짧은 큐는 페이드가 잘린다', () => {
  const sb = structuredClone(fixture);
  sb.narration[0] = { start: 0.4, end: 1.2, text_ko: '짧은 큐' }; // 0.8초
  const out = renderAss(sb, resolveProfile({
    storyboard: { delivery: { base: 'ttokttok', motion: { subtitle: { type: 'fade', inMs: 400, outMs: 400 } } } },
  }));
  assert.ok(out.includes('{\\fad(320,320)}짧은 큐')); // 800 * 0.4
});

test('정렬을 바꾸면 ASS Alignment 와 MarginV 가 따라온다', () => {
  // 자막을 상단으로: Alignment 8, MarginV 는 위에서의 거리
  const top = renderAss(fixture, resolveProfile({
    storyboard: { delivery: { base: 'ttokttok', subtitle: { align: 'top-center', marginV: 256 } } },
  }));
  assert.ok(top.includes(',8,288,288,256,1'));

  // 제목 카드도 옮길 수 있다 (예전엔 정중앙 0 고정)
  const t = renderAss(fixture, resolveProfile({
    storyboard: { delivery: { base: 'ttokttok', titleCard: { align: 'bottom-center', marginV: 700 } } },
  }));
  assert.ok(t.split('\n').find((l) => l.startsWith('Style: Title')).endsWith(',2,288,288,700,1'));
});

test('프로파일을 바꾸면 좌표·폰트·줄바꿈이 전부 따라온다', () => {
  const out = renderAss(fixture, resolveProfile({ name: 'generic-9x16' }));
  assert.ok(out.includes('PlayResX: 1080'));
  assert.ok(out.includes('PlayResY: 1920'));
  assert.ok(out.includes('Style: Sub,Noto Sans KR,54,'));
  assert.ok(out.includes(',2,130,130,384,1'));
  assert.ok(out.includes('Style: Title,Noto Sans KR,72,'));
  // 줄당 15자라 ttokttok(12자)에서 접히던 큐가 한 줄로 간다
  assert.ok(out.includes(',Sub,,0,0,0,,{\\fad(120,120)}몸이 벌레로 변해 있었다'));
  assert.ok(ass.includes(',Sub,,0,0,0,,{\\fad(120,120)}몸이 벌레로 변해\\N있었다'));
});

test('프로파일을 안 주면 storyboard.delivery 를 따르고, 그것도 없으면 기본값', () => {
  assert.ok(renderAss(fixture).includes('PlayResX: 1440')); // 픽스처가 ttokttok 선언
  const bare = structuredClone(fixture);
  delete bare.delivery;
  assert.ok(renderAss(bare).includes('PlayResX: 1080'));
});

test('큐 → Dialogue, 12자 줄바꿈은 \\N', () => {
  assert.ok(ass.includes('Dialogue: 0,0:00:00.40,0:00:02.80,Sub,,0,0,0,,{\\fad(120,120)}아침에 눈을 떴는데'));
  assert.ok(ass.includes('Dialogue: 0,0:00:03.20,0:00:05.80,Sub,,0,0,0,,{\\fad(120,120)}몸이 벌레로 변해\\N있었다'));
});

test('제목 카드: Title 스타일, at부터 끝까지', () => {
  assert.ok(ass.includes('Dialogue: 0,0:00:12.50,0:00:15.00,Title,,0,0,0,,{\\fad(200,200)}변신 · 프란츠 카프카'));
});

test('no_subtitle 큐는 자막에서 빠진다 — 말은 하되 화면에는 안 뜬다', () => {
  // 제목을 마지막 큐에서 말하면서 제목 카드도 띄우면 같은 글자가 두 번 겹친다
  const sb = structuredClone(fixture);
  sb.narration.at(-1).no_subtitle = true;
  const out = renderAss(sb, ttok);
  assert.ok(!out.includes('}카프카, 변신'));
  assert.ok(out.includes(',Title,,0,0,0,,{\\fad(200,200)}변신 · 프란츠 카프카')); // 제목 카드는 남는다
  assert.equal(out.split('\n').filter((l) => l.includes(',Sub,')).length, fixture.narration.length - 1);
});

test('큐는 start 순으로 정렬된다', () => {
  const sb = structuredClone(fixture);
  sb.narration.reverse();
  const lines = renderAss(sb, ttok).split('\n').filter((l) => l.includes(',Sub,'));
  assert.ok(lines[0].includes('0:00:00.40'));
});

test('중괄호는 이스케이프', () => {
  const sb = structuredClone(fixture);
  sb.narration[0].text_ko = '가나{다}';
  assert.ok(renderAss(sb, ttok).includes('가나\\{다\\}'));
});

test('burn.ps1: 상대 경로 ass 필터, ffmpeg·입력 파일 검사', () => {
  const ps = renderBurnPs1(ttok);
  assert.ok(ps.includes('Set-Location $PSScriptRoot'));
  assert.ok(ps.includes('-vf "ass=subtitles.ass"'));
  assert.ok(ps.includes('Get-Command ffmpeg'));
  assert.ok(ps.includes('Test-Path $In'));
  assert.ok(ps.includes('-c:a copy'));
});

test('burn.ps1: fonts.dir 를 주면 fontsdir 인자가 박힌다', () => {
  const p = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', fonts: { dir: 'C:/fonts' } } } });
  assert.ok(renderBurnPs1(p).includes('-vf "ass=subtitles.ass:fontsdir=C\\:/fonts"'));
});

test('burn.ps1: 쓰는 폰트 이름을 적어둔다 — 없으면 조용히 대체되므로', () => {
  const ps = renderBurnPs1(ttok);
  assert.ok(ps.includes('Malgun Gothic'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTIONS, anchorFor, motionTag } from './motion.mjs';

const canvas = { width: 1440, height: 2560 };
const box = { canvas, marginX: 288, marginV: 384 };

test('지원하는 효과 목록', () => {
  assert.deepEqual(Object.keys(MOTIONS).sort(), ['fade', 'none', 'pop', 'slide-up']);
});

test('앵커: 정렬에 따라 기준점이 달라진다', () => {
  // 하단(1,2,3) — 아래에서 marginV 만큼
  assert.deepEqual(anchorFor(2, box), { x: 720, y: 2176 });   // 2560-384
  assert.deepEqual(anchorFor(1, box), { x: 288, y: 2176 });   // 좌측 = marginX
  assert.deepEqual(anchorFor(3, box), { x: 1152, y: 2176 });  // 우측 = width-marginX
  // 상단(7,8,9) — 위에서 marginV 만큼
  assert.deepEqual(anchorFor(8, box), { x: 720, y: 384 });
  // 중앙(4,5,6) — ASS가 MarginV를 무시하므로 우리도 무시한다
  assert.deepEqual(anchorFor(5, box), { x: 720, y: 1280 });
  assert.deepEqual(anchorFor(5, { ...box, marginV: 999 }), { x: 720, y: 1280 });
});

test('none: 태그를 아예 붙이지 않는다 — 지금까지의 출력 그대로', () => {
  assert.equal(motionTag({ type: 'none' }, { align: 2, durationMs: 2400, size: 72, ...box }), '');
});

test('fade: \\fad(in,out)', () => {
  const t = motionTag({ type: 'fade', inMs: 120, outMs: 120 }, { align: 2, durationMs: 2400, size: 72, ...box });
  assert.equal(t, '{\\fad(120,120)}');
});

test('pop: 크게 시작해 제자리로 — 시작 스케일을 먼저 박고 \\t로 100까지', () => {
  const t = motionTag({ type: 'pop', inMs: 150, outMs: 120, scale: 1.12 }, { align: 2, durationMs: 2400, size: 72, ...box });
  assert.equal(t, '{\\fad(150,120)\\fscx112\\fscy112\\t(0,150,\\fscx100\\fscy100)}');
});

test('slide-up: 앵커 아래에서 올라온다. 정렬을 바꾸면 좌표가 따라온다', () => {
  const base = { durationMs: 2400, size: 72, ...box };
  const bottom = motionTag({ type: 'slide-up', inMs: 200, outMs: 120, distance: 40 }, { align: 2, ...base });
  assert.equal(bottom, '{\\fad(200,120)\\move(720,2216,720,2176,0,200)}');

  const top = motionTag({ type: 'slide-up', inMs: 200, outMs: 120, distance: 40 }, { align: 8, ...base });
  assert.equal(top, '{\\fad(200,120)\\move(720,424,720,384,0,200)}');
});

test('slide-up: distance 를 안 주면 글자 크기에서 유도한다', () => {
  const t = motionTag({ type: 'slide-up', inMs: 200, outMs: 120 }, { align: 2, durationMs: 2400, size: 72, ...box });
  assert.ok(t.includes('\\move(720,2219,720,2176,0,200)')); // 384 - round(72*0.6)=43 → 2176+43
});

test('짧은 큐에서는 페이드를 잘라낸다 — 큐보다 긴 페이드는 안 보이거나 깜빡인다', () => {
  // 0.8초 큐에 400/400 을 넣으면 각 변 40%(320ms)로 제한
  const t = motionTag({ type: 'fade', inMs: 400, outMs: 400 }, { align: 2, durationMs: 800, size: 72, ...box });
  assert.equal(t, '{\\fad(320,320)}');
  // 넉넉하면 그대로
  const ok = motionTag({ type: 'fade', inMs: 120, outMs: 120 }, { align: 2, durationMs: 2400, size: 72, ...box });
  assert.equal(ok, '{\\fad(120,120)}');
});

test('알 수 없는 효과는 던진다', () => {
  assert.throws(() => motionTag({ type: 'sparkle' }, { align: 2, durationMs: 2400, size: 72, ...box }), /sparkle/);
});

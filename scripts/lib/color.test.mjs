import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAssColor, contrastRatio } from './color.mjs';

test('#RRGGBB → &HAABBGGRR (BGR 역순, 알파 00 = 불투명)', () => {
  assert.equal(toAssColor('#FFFFFF'), '&H00FFFFFF');
  assert.equal(toAssColor('#000000'), '&H00000000');
  // 빨강 #FF0000 은 BGR로 뒤집혀 0000FF 가 된다 — 직접 쓰면 틀리기 쉬운 지점
  assert.equal(toAssColor('#FF0000'), '&H000000FF');
  assert.equal(toAssColor('#123456'), '&H00563412');
});

test('CSS 알파는 뒤집어 넣는다 — CSS FF(불투명) = ASS 00', () => {
  assert.equal(toAssColor('#FFFFFFFF'), '&H00FFFFFF'); // 완전 불투명
  assert.equal(toAssColor('#00000080'), '&H7F000000'); // 50% → 0xFF-0x80 = 0x7F
  assert.equal(toAssColor('#00000000'), '&HFF000000'); // 완전 투명
});

test('# 없이 써도 되고, 소문자도 받는다', () => {
  assert.equal(toAssColor('ffffff'), '&H00FFFFFF');
  assert.equal(toAssColor('#abc123'), '&H0023C1AB');
});

test('ASS 원형을 그대로 주면 통과시킨다 — 아는 사람은 직접 쓸 수 있다', () => {
  assert.equal(toAssColor('&H7F1A2B3C'), '&H7F1A2B3C');
  assert.equal(toAssColor('&h7f1a2b3c'), '&H7F1A2B3C');
});

test('알 수 없는 형식은 던진다 — 조용히 검정으로 떨어지지 않는다', () => {
  assert.throws(() => toAssColor('red'), /red/);
  assert.throws(() => toAssColor('#12345'), /#12345/);
  assert.throws(() => toAssColor(''), /색/);
});

test('명암비 (WCAG)', () => {
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#000000')), 21);
  assert.equal(Math.round(contrastRatio('#000000', '#FFFFFF')), 21); // 순서 무관
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#FFFFFF')), 1);
  // 흰 글자에 회색 외곽선은 WCAG AA 기준(4.5) 아래로 떨어진다
  assert.ok(contrastRatio('#FFFFFF', '#AAAAAA') < 4.5);
  assert.ok(contrastRatio('#FFFFFF', '#AAAAAA') > 2);
});

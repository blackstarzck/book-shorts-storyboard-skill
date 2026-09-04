import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BUILTIN_PROFILES, DEFAULT_PROFILE, ALIGNMENTS, resolveProfile } from './profile.mjs';

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

test('색은 hex로 받아 ASS 형식으로 유도한다', () => {
  const p = resolveProfile({ name: 'ttokttok' });
  assert.equal(p.subtitle.color, '#FFFFFF');
  assert.equal(p.subtitle.outlineColor, '#000000');
  assert.equal(p.derived.ass.color, '&H00FFFFFF');
  assert.equal(p.derived.ass.outlineColor, '&H00000000');
  assert.equal(p.derived.ass.shadowColor, '&H7F000000'); // #00000080 → ASS는 알파가 뒤집힌다
});

test('제목 카드 색은 생략하면 자막 색을 따른다', () => {
  const p = resolveProfile({ name: 'ttokttok' });
  assert.equal(p.derived.assTitle.color, p.derived.ass.color);

  const o = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', titleCard: { color: '#FFD400' } } } });
  assert.equal(o.derived.assTitle.color, '&H0000D4FF'); // BGR 역순
  assert.equal(o.derived.ass.color, '&H00FFFFFF');      // 자막은 그대로
});

test('명암비가 낮으면 경고한다 — 막지는 않는다', () => {
  const ok = resolveProfile({ name: 'ttokttok' });
  assert.deepEqual(ok.warnings, []);

  const bad = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', subtitle: { outlineColor: '#AAAAAA' } } } });
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /명암비/);
  assert.match(bad.warnings[0], /자막/);
  assert.equal(bad.derived.ass.outlineColor, '&H00AAAAAA'); // 경고만 하고 값은 그대로 쓴다
});

test('폰트: 이름 · 웹 폴백 스택 · 폰트 폴더가 다 프로파일에 있다', () => {
  const p = resolveProfile({ name: 'ttokttok' });
  assert.equal(p.subtitle.font, 'Malgun Gothic');
  assert.ok(Array.isArray(p.fonts.webStack));
  assert.equal(p.fonts.dir, null); // 시스템 폰트를 쓰면 지정할 필요 없다
});

test('콘티 시트 CSS 스택은 자막 폰트를 맨 앞에 두고 유도된다', () => {
  const p = resolveProfile({ name: 'ttokttok' });
  // 시트와 영상이 같은 폰트로 보이게 — 자막 폰트가 항상 1순위
  assert.ok(p.derived.cssFontStack.startsWith('"Malgun Gothic"'));
  assert.ok(p.derived.cssFontStack.endsWith('sans-serif'));

  const o = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', subtitle: { font: 'Pretendard' } } } });
  assert.ok(o.derived.cssFontStack.startsWith('"Pretendard"'));
  // 제목 카드 폰트가 다르면 그것도 스택에 들어간다
  const t = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', titleCard: { font: 'Black Han Sans' } } } });
  assert.ok(t.derived.cssFontStack.includes('"Black Han Sans"'));
});

test('스택에 같은 폰트가 두 번 들어가지 않는다', () => {
  const p = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', fonts: { webStack: ['Malgun Gothic', 'serif'] } } } });
  const count = p.derived.cssFontStack.split('"Malgun Gothic"').length - 1;
  assert.equal(count, 1);
});

test('fonts.dir 를 주면 ffmpeg 인자로 유도된다 — 경로의 콜론을 이스케이프한다', () => {
  const p = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', fonts: { dir: 'C:/fonts' } } } });
  assert.equal(p.derived.assFilter, 'ass=subtitles.ass:fontsdir=C\\:/fonts');

  const none = resolveProfile({ name: 'ttokttok' });
  assert.equal(none.derived.assFilter, 'ass=subtitles.ass');
});

test('정렬: 이름으로 쓰고 ASS 숫자로 유도된다', () => {
  // ASS Alignment는 숫자패드 배치 (1 좌하 ~ 9 우상). 숫자를 외우게 하지 않는다.
  assert.equal(ALIGNMENTS['bottom-center'], 2);
  assert.equal(ALIGNMENTS['bottom-left'], 1);
  assert.equal(ALIGNMENTS['middle-center'], 5);
  assert.equal(ALIGNMENTS['top-center'], 8);
  assert.equal(ALIGNMENTS['top-right'], 9);

  const p = resolveProfile({ name: 'ttokttok' });
  assert.equal(p.subtitle.align, 'bottom-center');
  assert.equal(p.titleCard.align, 'middle-center');
  assert.equal(p.derived.align.subtitle, 2);
  assert.equal(p.derived.align.titleCard, 5);
});

test('정렬을 바꾸면 유도값이 따라온다. 숫자를 직접 줘도 받는다', () => {
  const top = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', subtitle: { align: 'top-center' } } } });
  assert.equal(top.derived.align.subtitle, 8);

  const raw = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', subtitle: { align: 7 } } } });
  assert.equal(raw.derived.align.subtitle, 7);
});

test('알 수 없는 정렬은 던진다 — 조용히 하단 중앙으로 떨어지지 않는다', () => {
  assert.throws(
    () => resolveProfile({ storyboard: { delivery: { subtitle: { align: 'bottom' } } } }),
    /bottom/,
  );
  assert.throws(
    () => resolveProfile({ storyboard: { delivery: { subtitle: { align: 10 } } } }),
    /10/,
  );
});

test('marginV: 기준점에서의 거리. marginBottom 은 별칭으로 계속 받는다', () => {
  const p = resolveProfile({ name: 'ttokttok' });
  assert.equal(p.subtitle.marginV, 384);

  // 예전 이름으로 쓴 프로파일도 깨지지 않는다
  const legacy = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', subtitle: { marginBottom: 500 } } } });
  assert.equal(legacy.subtitle.marginV, 500);

  // 제목 카드도 위치를 잡을 수 있다 (예전엔 0 고정이었다)
  const t = resolveProfile({ storyboard: { delivery: { base: 'ttokttok', titleCard: { align: 'top-center', marginV: 300 } } } });
  assert.equal(t.derived.align.titleCard, 8);
  assert.equal(t.titleCard.marginV, 300);
});

test('애니메이션: 기본은 페이드, 효과 이름은 프로파일 해석에서 검증된다', () => {
  const p = resolveProfile({ name: 'ttokttok' });
  assert.equal(p.motion.subtitle.type, 'fade');
  assert.equal(p.derived.motion.subtitle, 'fade');
  assert.equal(p.derived.motion.titleCard, 'fade');

  // 렌더 도중이 아니라 여기서 던져야 스택 트레이스 대신 메시지가 나온다
  assert.throws(
    () => resolveProfile({ storyboard: { delivery: { motion: { subtitle: { type: 'sparkle' } } } } }),
    /sparkle/,
  );
});

test('잘못된 색 형식은 프로파일 해석에서 던진다', () => {
  assert.throws(
    () => resolveProfile({ storyboard: { delivery: { subtitle: { color: 'red' } } } }),
    /red/,
  );
});

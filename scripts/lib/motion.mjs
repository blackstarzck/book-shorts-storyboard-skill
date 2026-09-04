/**
 * 자막 애니메이션 — ASS 오버라이드 태그를 만든다.
 *
 * 효과는 프로파일이 정하고(`motion` 블록), 태그 조립은 여기서 한다.
 * 좌표가 필요한 효과(slide-up)는 **프로파일의 정렬·여백에서 앵커를 계산한다** —
 * 정렬을 바꾸면 애니메이션 방향도 자동으로 따라온다.
 *
 * 넣지 않은 것: 타자기·카라오케. 둘 다 음절 단위 타이밍이 필요한데, 이 스킬의
 * 큐는 문장 단위라 그 정보가 없다. 없는 정보로 흉내내면 글자가 엉뚱하게 끊긴다.
 */

export const MOTIONS = {
  none: '태그 없음. 딱 끊어 나타난다',
  fade: '페이드 인·아웃',
  pop: '살짝 크게 나타나 제자리로',
  'slide-up': '아래에서 올라오며 페이드',
};

/** 페이드가 큐보다 길면 안 보이거나 깜빡인다. 한 변당 큐의 40%로 제한한다. */
const FADE_MAX_RATIO = 0.4;

/**
 * 정렬(ASS 숫자패드)에서 텍스트 기준점을 구한다.
 * 세로: 하단(1~3) 아래에서 marginV / 상단(7~9) 위에서 marginV / 중앙(4~6)은
 * ASS가 MarginV를 무시하므로 우리도 무시하고 정중앙.
 */
export function anchorFor(align, { canvas, marginX, marginV }) {
  const col = (align - 1) % 3;          // 0 좌 · 1 중 · 2 우
  const row = Math.floor((align - 1) / 3); // 0 하 · 1 중 · 2 상
  const x = col === 0 ? marginX : col === 2 ? canvas.width - marginX : Math.round(canvas.width / 2);
  const y = row === 0 ? canvas.height - marginV : row === 2 ? marginV : Math.round(canvas.height / 2);
  return { x, y };
}

/**
 * @param motion 프로파일의 motion 항목 { type, inMs, outMs, scale?, distance? }
 * @param ctx { align, durationMs, size, canvas, marginX, marginV }
 * @returns Dialogue 텍스트 앞에 붙일 `{\...}` 또는 빈 문자열
 */
export function motionTag(motion, ctx) {
  const type = motion?.type ?? 'none';
  if (!(type in MOTIONS)) {
    throw new Error(`알 수 없는 자막 효과: '${type}'. ${Object.keys(MOTIONS).join(' | ')} 중 하나여야 한다.`);
  }
  if (type === 'none') return '';

  const cap = Math.floor(ctx.durationMs * FADE_MAX_RATIO);
  const inMs = Math.min(Math.round(motion.inMs ?? 120), cap);
  const outMs = Math.min(Math.round(motion.outMs ?? 120), cap);
  const parts = [`\\fad(${inMs},${outMs})`];

  if (type === 'pop') {
    // 크게 시작해 제자리로. 시작 스케일을 먼저 박아야 첫 프레임부터 적용된다.
    const s = Math.round((motion.scale ?? 1.12) * 100);
    parts.push(`\\fscx${s}\\fscy${s}`, `\\t(0,${inMs},\\fscx100\\fscy100)`);
  }

  if (type === 'slide-up') {
    const { x, y } = anchorFor(ctx.align, ctx);
    const distance = Math.round(motion.distance ?? ctx.size * 0.6);
    parts.push(`\\move(${x},${y + distance},${x},${y},0,${inMs})`);
  }

  return `{${parts.join('')}}`;
}

import { toAssTimecode } from './timecode.mjs';
import { wrapCue } from './text.mjs';
import { resolveProfile } from './profile.mjs';
import { motionTag } from './motion.mjs';

/**
 * ASS 자막. 좌표·색이 전부 납품 프로파일에서 온다 (lib/profile.mjs).
 * 줄바꿈 글자수도 같은 좌표에서 유도된 값(derived.maxLineLen)을 쓴다 —
 * 폰트나 마진을 바꾸면 줄바꿈이 자동으로 따라온다.
 *
 * 색은 hex로 받아 프로파일이 ASS 형식(&HAABBGGRR)으로 변환해 준다. 명암비가
 * 낮으면 프로파일이 경고를 달아 보내고, 빌드가 그 경고를 그대로 노출한다.
 */
const styleLine = (name, { font, size, outline, shadow, alignment, marginX, marginV, ass }) =>
  `Style: ${name},${font},${size},${ass.color},${ass.color},${ass.outlineColor},${ass.shadowColor},-1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},${marginX},${marginX},${marginV},1`;

const esc = (t) => String(t).replace(/[{}]/g, (m) => `\\${m}`).replace(/\r?\n/g, ' ');

export function renderAss(sb, profile = resolveProfile({ storyboard: sb })) {
  const { canvas, subtitle: sub, titleCard: title, derived } = profile;
  const motion = profile.motion ?? { subtitle: { type: 'none' }, titleCard: { type: 'none' } };

  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // 정렬은 프로파일에서 온다. MarginV는 정렬된 기준 변에서의 거리다
    // (하단 정렬이면 아래에서, 상단 정렬이면 위에서). 중앙 정렬에서는 무시된다.
    styleLine('Sub', {
      font: sub.font, size: sub.size, outline: sub.outline, shadow: sub.shadow ?? 0,
      alignment: derived.align.subtitle, marginX: sub.marginX, marginV: sub.marginV, ass: derived.ass,
    }),
    styleLine('Title', {
      font: title.font ?? sub.font, size: title.size, outline: title.outline, shadow: title.shadow ?? 0,
      alignment: derived.align.titleCard, marginX: title.marginX ?? sub.marginX,
      marginV: title.marginV ?? 0, ass: derived.assTitle,
    }),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // no_subtitle 큐는 H3가 읽기만 하고 화면에는 안 띄운다 — 제목처럼 제목 카드가
  // 이미 보여주는 문구가 하단 자막으로 한 번 더 나오는 중복을 막는다.
  // 애니메이션 태그는 큐마다 만든다 — 페이드를 큐 길이에 맞춰 잘라내야 하기 때문이다.
  const motionCtx = (align, marginV, durationSec, size) => ({
    align, size, marginV,
    canvas, marginX: sub.marginX,
    durationMs: Math.round(durationSec * 1000),
  });

  const cues = [...(sb.narration ?? [])].filter((c) => !c.no_subtitle).sort((a, b) => a.start - b.start);
  for (const c of cues) {
    const text = wrapCue(c.text_ko, derived.maxLineLen).map(esc).join('\\N');
    const tag = motionTag(motion.subtitle, motionCtx(derived.align.subtitle, sub.marginV, c.end - c.start, sub.size));
    lines.push(`Dialogue: 0,${toAssTimecode(c.start)},${toAssTimecode(c.end)},Sub,,0,0,0,,${tag}${text}`);
  }

  const titleTag = motionTag(
    motion.titleCard,
    motionCtx(derived.align.titleCard, title.marginV ?? 0, sb.duration_sec - sb.title_card.at, title.size),
  );
  lines.push(`Dialogue: 0,${toAssTimecode(sb.title_card.at)},${toAssTimecode(sb.duration_sec)},Title,,0,0,0,,${titleTag}${esc(sb.title_card.text_ko)}`);
  return lines.join('\n') + '\n';
}

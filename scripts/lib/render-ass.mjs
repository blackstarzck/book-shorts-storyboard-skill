import { toAssTimecode } from './timecode.mjs';
import { wrapCue } from './text.mjs';
import { resolveProfile } from './profile.mjs';

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
    // Alignment 2 = 하단 중앙, 5 = 정중앙
    styleLine('Sub', {
      font: sub.font, size: sub.size, outline: sub.outline, shadow: sub.shadow ?? 0,
      alignment: 2, marginX: sub.marginX, marginV: sub.marginBottom, ass: derived.ass,
    }),
    styleLine('Title', {
      font: title.font ?? sub.font, size: title.size, outline: title.outline, shadow: title.shadow ?? 0,
      alignment: 5, marginX: sub.marginX, marginV: 0, ass: derived.assTitle,
    }),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // no_subtitle 큐는 H3가 읽기만 하고 화면에는 안 띄운다 — 제목처럼 제목 카드가
  // 이미 보여주는 문구가 하단 자막으로 한 번 더 나오는 중복을 막는다.
  const cues = [...(sb.narration ?? [])].filter((c) => !c.no_subtitle).sort((a, b) => a.start - b.start);
  for (const c of cues) {
    const text = wrapCue(c.text_ko, derived.maxLineLen).map(esc).join('\\N');
    lines.push(`Dialogue: 0,${toAssTimecode(c.start)},${toAssTimecode(c.end)},Sub,,0,0,0,,${text}`);
  }
  lines.push(`Dialogue: 0,${toAssTimecode(sb.title_card.at)},${toAssTimecode(sb.duration_sec)},Title,,0,0,0,,${esc(sb.title_card.text_ko)}`);
  return lines.join('\n') + '\n';
}

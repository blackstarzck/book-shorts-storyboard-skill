import { toAssTimecode } from './timecode.mjs';
import { wrapCue } from './text.mjs';
import { resolveProfile } from './profile.mjs';

/**
 * ASS 자막. 좌표는 전부 납품 프로파일에서 온다 (lib/profile.mjs).
 * 줄바꿈 글자수도 같은 좌표에서 유도된 값(derived.maxLineLen)을 쓴다 —
 * 폰트나 마진을 바꾸면 줄바꿈이 자동으로 따라온다.
 *
 * 색은 프로파일에 넣지 않았다. 흰 글자 + 검정 외곽선은 어떤 배경에서도 읽히는
 * 사실상의 표준이고, 여기를 열면 가독성이 떨어지는 조합을 고를 여지만 생긴다.
 */
const WHITE = '&H00FFFFFF';
const BLACK = '&H00000000';
const SHADOW_BG = '&H80000000';

const styleLine = (name, font, size, outline, alignment, marginX, marginV) =>
  `Style: ${name},${font},${size},${WHITE},${WHITE},${BLACK},${SHADOW_BG},-1,0,0,0,100,100,0,0,1,${outline},0,${alignment},${marginX},${marginX},${marginV},1`;

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
    styleLine('Sub', sub.font, sub.size, sub.outline, 2, sub.marginX, sub.marginBottom),
    styleLine('Title', sub.font, title.size, title.outline, 5, sub.marginX, 0),
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

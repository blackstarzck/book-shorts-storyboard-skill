/**
 * 색 변환과 명암비.
 *
 * 프로파일은 색을 일반 hex(`#RRGGBB` 또는 `#RRGGBBAA`)로 받는다. ASS의 원형은
 * `&HAABBGGRR` 로 **채널이 BGR 역순이고 알파가 뒤집혀 있어서**(00이 불투명),
 * 손으로 쓰면 빨강과 파랑이 바뀌는 실수가 난다. 변환은 여기서 한다.
 */

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i;
const ASS = /^&h([0-9a-f]{8})$/i;

/** `#RRGGBB` | `#RRGGBBAA` | `&HAABBGGRR` → `&HAABBGGRR` */
export function toAssColor(input) {
  const s = String(input ?? '').trim();
  if (!s) throw new Error('색이 비어 있다. #RRGGBB 또는 &HAABBGGRR 형식이어야 한다.');

  const ass = s.match(ASS);
  if (ass) return `&H${ass[1].toUpperCase()}`;

  const hex = s.match(HEX);
  if (!hex) throw new Error(`알 수 없는 색 형식: '${s}'. #RRGGBB, #RRGGBBAA, 또는 &HAABBGGRR 이어야 한다.`);

  const h = hex[1].toUpperCase();
  const [rr, gg, bb] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  // CSS 알파는 FF가 불투명, ASS는 00이 불투명이라 뒤집는다
  const cssAlpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 0xff;
  const aa = (0xff - cssAlpha).toString(16).padStart(2, '0').toUpperCase();
  return `&H${aa}${bb}${gg}${rr}`;
}

function channels(input) {
  const s = String(input ?? '').trim();
  const hex = s.match(HEX);
  if (hex) {
    const h = hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const ass = s.match(ASS);
  if (ass) {
    // &HAABBGGRR — 뒤에서부터 RR GG BB
    const h = ass[1];
    return [h.slice(6, 8), h.slice(4, 6), h.slice(2, 4)].map((c) => parseInt(c, 16) / 255);
  }
  throw new Error(`알 수 없는 색 형식: '${s}'`);
}

/** WCAG 상대 휘도 */
function luminance(color) {
  const [r, g, b] = channels(color).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 명암비 1~21. 순서는 무관하다. */
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

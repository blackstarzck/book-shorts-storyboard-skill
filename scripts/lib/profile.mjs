import { existsSync, readFileSync } from 'node:fs';
import { toAssColor, contrastRatio } from './color.mjs';

/**
 * 납품 프로파일 — 자막 좌표와 그로부터 유도되는 값들.
 *
 * 좌표만 설정으로 빼면 반쪽이다. 줄당 글자수와 영상 프롬프트의 "중앙 N%" 지시가
 * 같은 좌표에서 나오는 값이라, 좌표를 바꿨는데 그 둘이 그대로면 서로 어긋난다.
 * 그래서 여기서 함께 유도한다 (`derived`).
 *
 * 쓰는 곳: render-ass(스타일·마진) · validate(줄 제한) · render-h3(구도 지시) · render-md(표시)
 */

/** 앱마다 다른 값이므로 프로파일로 분리한다. 기본은 특정 앱에 묶이지 않은 generic. */
export const BUILTIN_PROFILES = {
  /**
   * 플랫폼 중립 세로 쇼츠. 유튜브 쇼츠·릴스·틱톡의 UI를 피하는 보수적인 값.
   * 플레이어가 좌우를 자르는지 알 수 없으므로 cropPerSide는 0이다.
   */
  'generic-9x16': {
    canvas: { width: 1080, height: 1920 },
    subtitle: {
      font: 'Noto Sans KR', size: 54, outline: 5, shadow: 0,
      marginX: 130, marginV: 384, maxLines: 2, align: 'bottom-center',
      color: '#FFFFFF', outlineColor: '#000000', shadowColor: '#00000080',
    },
    titleCard: { size: 72, outline: 6, shadow: 0, align: 'middle-center', marginV: 0 },
    // webStack: 콘티 시트(HTML)가 자막 폰트를 못 찾았을 때의 폴백.
    // dir: 시스템에 안 깔린 폰트를 쓸 때 ffmpeg 에 넘길 폴더. null 이면 시스템 폰트.
    fonts: { webStack: ['Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'], dir: null },
    framing: { cropPerSide: 0 },
  },

  /**
   * 똑똑 피드 실측 (2026-09-03). 근거는 references/ttokttok-delivery.md.
   * 플레이어가 object-cover라 좌우가 잘린다 — 그래서 cropPerSide가 있다.
   */
  ttokttok: {
    canvas: { width: 1440, height: 2560 },
    subtitle: {
      font: 'Malgun Gothic', size: 72, outline: 6, shadow: 0,
      marginX: 288, marginV: 384, maxLines: 2, align: 'bottom-center',
      color: '#FFFFFF', outlineColor: '#000000', shadowColor: '#00000080',
    },
    titleCard: { size: 96, outline: 8, shadow: 0, align: 'middle-center', marginV: 0 },
    fonts: { webStack: ['Noto Sans KR', 'Apple SD Gothic Neo', 'sans-serif'], dir: null },
    framing: { cropPerSide: 0.06 },
  },
};

export const DEFAULT_PROFILE = 'generic-9x16';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function mergeDeep(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? mergeDeep(base[k], v) : v;
  }
  return out;
}

/** 자막 가독성 하한. WCAG AA 기준. 영상 위 자막은 배경을 못 고르므로 외곽선이 유일한 분리 수단이다. */
export const MIN_CONTRAST = 4.5;

/**
 * ASS Alignment. 숫자패드 배치라 1이 좌하, 9가 우상이다.
 * 이름으로 쓰게 하는 이유: 숫자만 보고 어디인지 아는 사람이 드물고,
 * 8을 상단이라고 착각해 5(정중앙)를 쓰는 실수가 흔하다.
 */
export const ALIGNMENTS = {
  'bottom-left': 1, 'bottom-center': 2, 'bottom-right': 3,
  'middle-left': 4, 'middle-center': 5, 'middle-right': 6,
  'top-left': 7, 'top-center': 8, 'top-right': 9,
};

const ALIGN_NUMBERS = new Set(Object.values(ALIGNMENTS));

function toAlign(value, where) {
  if (typeof value === 'number') {
    if (!ALIGN_NUMBERS.has(value)) throw new Error(`${where}: 알 수 없는 정렬 ${value}. 1~9 (ASS 숫자패드) 이어야 한다.`);
    return value;
  }
  const n = ALIGNMENTS[String(value ?? '').trim()];
  if (!n) throw new Error(`${where}: 알 수 없는 정렬 '${value}'. ${Object.keys(ALIGNMENTS).join(' | ')} 중 하나이거나 1~9 숫자여야 한다.`);
  return n;
}

/** 좌표·색에서 나오는 값들. 손으로 적어두지 않는다. */
function derive(p) {
  const usableWidth = p.canvas.width - p.subtitle.marginX * 2;
  const crop = p.framing?.cropPerSide ?? 0;
  const sub = p.subtitle;
  const title = p.titleCard;
  const assFor = (src) => ({
    color: toAssColor(src.color ?? sub.color),
    outlineColor: toAssColor(src.outlineColor ?? sub.outlineColor),
    shadowColor: toAssColor(src.shadowColor ?? sub.shadowColor),
  });
  // 콘티 시트가 영상과 같은 폰트로 보이도록 자막 폰트를 맨 앞에 둔다.
  // 제목 카드가 다른 폰트면 그것도 넣고, 나머지는 프로파일의 폴백 스택.
  const stack = [sub.font, title.font, ...(p.fonts?.webStack ?? [])].filter(Boolean);
  const seen = new Set();
  const cssFontStack = stack
    .filter((f) => !seen.has(f) && seen.add(f))
    .map((f) => (f === 'sans-serif' || f === 'serif' || f === 'monospace' ? f : `"${f}"`))
    .join(', ');

  // libass 필터 인자. 경로의 드라이브 콜론은 이스케이프해야 필터 구분자로 안 먹힌다.
  const dir = p.fonts?.dir;
  const assFilter = dir ? `ass=subtitles.ass:fontsdir=${String(dir).replace(/:/g, '\\:')}` : 'ass=subtitles.ass';

  return {
    usableWidth,
    // 한글은 정사각에 가까워 글자수 ≈ 폭 / 글자크기. 보수적으로 내림한다.
    maxLineLen: Math.max(1, Math.floor(usableWidth / sub.size)),
    // 크롭이 없으면 구도 지시를 넣지 않는다 — "중앙 100%"는 무의미하다.
    safeCenterPct: crop > 0 ? Math.round((1 - crop * 2) * 100) : null,
    ass: assFor(sub),
    // 제목 카드 색을 안 주면 자막 색을 그대로 쓴다
    assTitle: assFor(title),
    // 이름 → ASS 숫자. 알 수 없는 값은 던진다 (조용히 하단 중앙으로 떨어지지 않는다)
    align: {
      subtitle: toAlign(sub.align, '자막 정렬'),
      titleCard: toAlign(title.align, '제목 카드 정렬'),
    },
    cssFontStack,
    assFilter,
  };
}

/**
 * `marginBottom` → `marginV` 로 이름을 바꿨다. 정렬을 열면서 "하단"이라는 이름이
 * 거짓이 됐기 때문이다 (상단 정렬에서는 상단으로부터의 거리다).
 * 예전 이름으로 쓴 프로파일이 조용히 무시되지 않게 별칭으로 받는다.
 */
function migrate(p) {
  for (const key of ['subtitle', 'titleCard']) {
    const block = p[key];
    if (block && block.marginBottom !== undefined) {
      block.marginV = block.marginBottom;
      delete block.marginBottom;
    }
  }
  return p;
}

/** 값을 막지는 않는다. 고른 사람이 알고 고르게만 한다. */
function colorWarnings(p) {
  const out = [];
  const sub = p.subtitle;
  const check = (label, fg, bg) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < MIN_CONTRAST) {
      out.push(`${label} 명암비 ${ratio.toFixed(1)}:1 — 권장 ${MIN_CONTRAST}:1 이상. 영상 위 자막은 배경을 고를 수 없어 외곽선이 유일한 분리 수단이다 (글자 ${fg} / 외곽선 ${bg}).`);
    }
  };
  check('자막', sub.color, sub.outlineColor);
  const t = p.titleCard;
  if (t.color || t.outlineColor) {
    check('제목 카드', t.color ?? sub.color, t.outlineColor ?? sub.outlineColor);
  }
  return out;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** 이름이면 내장 프로파일, 경로면 JSON 파일. 둘 다 아니면 던진다. */
function fromNameOrPath(value) {
  if (BUILTIN_PROFILES[value]) return { spec: {}, base: value, source: `builtin:${value}` };
  if (existsSync(value)) return { spec: readJson(value), base: null, source: value };
  throw new Error(`알 수 없는 납품 프로파일: '${value}'. 내장(${Object.keys(BUILTIN_PROFILES).join('|')}) 이름이거나 존재하는 JSON 경로여야 한다.`);
}

/**
 * 우선순위: CLI(--profile) > storyboard.delivery > 기본 프로파일.
 * `delivery`는 내장 이름(문자열) 또는 `{ base?, ...덮어쓸 값 }` 객체.
 */
export function resolveProfile({ cli, storyboard, name } = {}) {
  let spec = {};
  let baseName = DEFAULT_PROFILE;
  let source = `builtin:${DEFAULT_PROFILE}`;

  const pick = cli ?? name ?? storyboard?.delivery;

  if (typeof pick === 'string' && pick.trim()) {
    const r = fromNameOrPath(pick.trim());
    spec = r.spec;
    baseName = r.base ?? spec.base ?? DEFAULT_PROFILE;
    source = r.source;
  } else if (isPlainObject(pick)) {
    spec = pick;
    baseName = pick.base ?? DEFAULT_PROFILE;
    source = 'storyboard.delivery';
  }

  const base = BUILTIN_PROFILES[baseName];
  if (!base) throw new Error(`알 수 없는 base 프로파일: '${baseName}'`);

  const { base: _drop, ...overrides } = spec;
  const merged = migrate(mergeDeep(base, overrides));
  // derive 가 색·정렬을 변환하므로 형식 오류는 여기서 던진다 — 조용히 기본값으로 떨어지지 않는다
  return { ...merged, name: baseName, source, derived: derive(merged), warnings: colorWarnings(merged) };
}

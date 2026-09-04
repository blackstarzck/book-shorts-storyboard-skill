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
      marginX: 130, marginBottom: 384, maxLines: 2,
      color: '#FFFFFF', outlineColor: '#000000', shadowColor: '#00000080',
    },
    titleCard: { size: 72, outline: 6, shadow: 0 },
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
      marginX: 288, marginBottom: 384, maxLines: 2,
      color: '#FFFFFF', outlineColor: '#000000', shadowColor: '#00000080',
    },
    titleCard: { size: 96, outline: 8, shadow: 0 },
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
  return {
    usableWidth,
    // 한글은 정사각에 가까워 글자수 ≈ 폭 / 글자크기. 보수적으로 내림한다.
    maxLineLen: Math.max(1, Math.floor(usableWidth / sub.size)),
    // 크롭이 없으면 구도 지시를 넣지 않는다 — "중앙 100%"는 무의미하다.
    safeCenterPct: crop > 0 ? Math.round((1 - crop * 2) * 100) : null,
    ass: assFor(sub),
    // 제목 카드 색을 안 주면 자막 색을 그대로 쓴다
    assTitle: assFor(title),
  };
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
  const merged = mergeDeep(base, overrides);
  // derive 가 색을 변환하므로 형식 오류는 여기서 던진다 — 조용히 검정으로 떨어지지 않는다
  return { ...merged, name: baseName, source, derived: derive(merged), warnings: colorWarnings(merged) };
}

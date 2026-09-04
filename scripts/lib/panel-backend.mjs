import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPanelPrompts } from './render-panels.mjs';

/**
 * 콘티 패널 이미지 생성 백엔드.
 *
 * 이 스킬은 특정 AI 서비스에 묶이지 않는다. 패널 생성은 "지시문 파일을 읽고
 * 이미지를 만들어 지정한 경로에 저장할 수 있는 CLI"라면 무엇이든 쓸 수 있다.
 * 명령은 `{prompt}` 자리표시자를 가진 템플릿 한 줄로 설정한다.
 *
 * 백엔드가 없어도 스킬은 동작한다 — `panel-prompts.txt`에 패널별 프롬프트가
 * 그대로 나오므로 어느 이미지 도구에든 붙여넣어 결과를 panels/ 에 두면 된다.
 */

/**
 * 내장 프리셋. **실제로 확인한 것만 싣는다.**
 * 확인하지 않은 CLI의 플래그를 추측해 넣으면, 쓰는 사람은 그게 검증된 줄 안다.
 * 다른 도구는 --panel-cmd / 환경변수 / 설정 파일로 붙인다 (README 참조).
 */
export const PANEL_BACKENDS = {
  // 2026-09-03 실측. 두 -c 오버라이드가 없으면 앱이 쓴 config 때문에 죽는다.
  codex: 'codex exec -c service_tier=fast -c model=gpt-5.5 --skip-git-repo-check {prompt}',
};

export const INSTRUCTION_FILE = 'panel-instruction.txt';
export const CONFIG_FILE = 'panel-backend.json';
export const ENV_VAR = 'BOOK_SHORTS_PANEL_CMD';

/** CLI > 환경변수 > 스킬 폴더의 설정 파일 > 기본 프리셋 */
export function resolvePanelCommand({ skillRoot, env = process.env, cli } = {}) {
  const asTemplate = (value, source) => {
    if (PANEL_BACKENDS[value]) return { template: PANEL_BACKENDS[value], source: `${source}:${value}` };
    return { template: value, source };
  };

  if (cli?.trim()) return asTemplate(cli.trim(), '--panel-cmd');

  const fromEnv = env?.[ENV_VAR];
  if (fromEnv?.trim()) return asTemplate(fromEnv.trim(), `env:${ENV_VAR}`);

  const configPath = skillRoot ? join(skillRoot, CONFIG_FILE) : null;
  if (configPath && existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      if (cfg.command?.trim()) return asTemplate(cfg.command.trim(), CONFIG_FILE);
    } catch {
      // 설정이 깨졌으면 무시하고 기본으로 간다 — 패널은 선택 산출물이다
    }
  }

  return { template: PANEL_BACKENDS.codex, source: 'default:codex' };
}

/** `{prompt}` 자리에 인용된 프롬프트를 넣는다. 자리표시자가 없으면 끝에 붙인다. */
export function buildCommand(template, prompt) {
  const quoted = JSON.stringify(prompt);
  return template.includes('{prompt}') ? template.replaceAll('{prompt}', quoted) : `${template} ${quoted}`;
}

/** 세션 1회로 전 패널을 만든다 — 패널마다 세션을 띄우면 분 단위로 낭비된다. */
export function buildPanelInstruction(jobs) {
  return [
    'You are asked to do image generation. Use whatever built-in image generation capability you have.',
    `Generate ${jobs.length} storyboard panel images, one generation call per panel, each in VERTICAL PORTRAIT orientation (clearly taller than wide, 9:16).`,
    'Save each result into the current working directory at the exact relative path given below (create the panels/ folder if missing).',
    'Do not create, modify, or delete any other file. Never add text or lettering to the images.',
    '',
    ...jobs.flatMap((j) => [`### ${j.file}`, j.prompt, '']),
    'When every file listed above exists, reply with the list of written paths and nothing else.',
  ].join('\n');
}

export function defaultRunner(command, cwd, timeoutMs) {
  const r = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

export function generatePanels(dir, sb, {
  force = false,
  timeoutMs = 600_000,
  runner = defaultRunner,
  skillRoot,
  env = process.env,
  cli,
} = {}) {
  const all = renderPanelPrompts(sb);
  const jobs = force ? all : all.filter((j) => !existsSync(join(dir, j.file)));
  const skipped = all.filter((j) => !jobs.includes(j)).map((j) => j.file);
  if (!jobs.length) return { ran: false, generated: [], skipped, missing: [] };

  const { template, source } = resolvePanelCommand({ skillRoot, env, cli });
  mkdirSync(join(dir, 'panels'), { recursive: true });
  writeFileSync(join(dir, INSTRUCTION_FILE), buildPanelInstruction(jobs), 'utf8');
  // 프롬프트를 인자로 넘기지 않고 파일로 읽게 한다 — 셸 인용 문제를 피한다
  const prompt = `Read ${INSTRUCTION_FILE} in the current working directory and follow it exactly.`;
  const res = runner(buildCommand(template, prompt), dir, timeoutMs);

  const generated = jobs.filter((j) => existsSync(join(dir, j.file))).map((j) => j.file);
  const missing = jobs.filter((j) => !existsSync(join(dir, j.file))).map((j) => j.file);
  const error = res.error?.message ?? null;
  return {
    ran: true,
    backend: source,
    generated,
    skipped,
    missing,
    status: res.status ?? null,
    error,
    hint: error || missing.length
      ? `다른 도구를 쓰려면 --panel-cmd "<명령> {prompt}" 또는 ${ENV_VAR} 환경변수, 또는 스킬 폴더의 ${CONFIG_FILE}. 백엔드 없이 가려면 panel-prompts.txt 의 프롬프트를 아무 이미지 도구에 붙여넣고 결과를 panels/ 에 두면 된다.`
      : null,
    stderrTail: String(res.stderr ?? '').slice(-2000),
  };
}

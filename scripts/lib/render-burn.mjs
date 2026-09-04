import { resolveProfile } from './profile.mjs';

/**
 * ffmpeg 번인 스크립트 (PowerShell). BOM은 파일 쓰기에서 붙인다.
 *
 * Set-Location으로 상대 경로를 쓰는 이유: libass 필터 인자에 드라이브 콜론(C:)이
 * 들어가면 이스케이프가 필요해 깨지기 쉽다.
 *
 * 폰트 이름을 스크립트에 적어두는 이유: libass는 폰트를 못 찾으면 **말없이 다른
 * 폰트로 대체**한다. 결과 영상을 보기 전까지 모르기 때문에, 어떤 폰트를 기대하는지
 * 실행하는 사람 눈에 보이게 둔다.
 */
export function renderBurnPs1(profile = resolveProfile({})) {
  const { subtitle, titleCard, fonts, derived } = profile;
  const names = [...new Set([subtitle.font, titleCard.font].filter(Boolean))].join(', ');
  const fontsNote = fonts?.dir
    ? `# 폰트 폴더: ${fonts.dir} (프로파일 fonts.dir)`
    : '# 시스템에 설치된 폰트를 쓴다. 못 찾으면 프로파일에 fonts.dir 를 지정하고 다시 빌드한다.';

  return `param(
  [string]$In = "input.mp4",
  [string]$Out = "output.mp4"
)
# 도서 소개 쇼츠 — 자막 번인. 생성: book-shorts-storyboard 스킬
# 사용: 영상 모델에서 받은 mp4를 이 폴더에 input.mp4로 두고 실행. 결과는 output.mp4
#
# 프로파일: ${profile.name} · 캔버스 ${profile.canvas.width}x${profile.canvas.height}
# 필요한 폰트: ${names}
${fontsNote}
# libass는 폰트를 못 찾으면 경고 없이 다른 폰트로 그린다 — 결과에서 글꼴을 확인할 것.
Set-Location $PSScriptRoot

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Error "ffmpeg가 없습니다. 설치: winget install Gyan.FFmpeg"
  exit 1
}
if (-not (Test-Path $In)) {
  Write-Error "$In 이(가) 없습니다. 영상 모델에서 받은 mp4를 이 이름으로 두세요 (또는 -In 경로)."
  exit 1
}

ffmpeg -y -i $In -vf "${derived.assFilter}" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg 실패 (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
Write-Host "완료: $Out  (자막 폰트 '${subtitle.font}' 이(가) 제대로 적용됐는지 확인하세요)"
`;
}

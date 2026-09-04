param(
  [string]$In = "input.mp4",
  [string]$Out = "output.mp4"
)
# 도서 소개 쇼츠 — 자막 번인. 생성: book-shorts-storyboard 스킬
# 사용: 영상 모델에서 받은 mp4를 이 폴더에 input.mp4로 두고 실행. 결과는 output.mp4
#
# 프로파일: ttokttok · 캔버스 1440x2560
# 필요한 폰트: Malgun Gothic
# 시스템에 설치된 폰트를 쓴다. 못 찾으면 프로파일에 fonts.dir 를 지정하고 다시 빌드한다.
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

ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out
if ($LASTEXITCODE -ne 0) { Write-Error "ffmpeg 실패 (exit $LASTEXITCODE)"; exit $LASTEXITCODE }
Write-Host "완료: $Out  (자막 폰트 'Malgun Gothic' 이(가) 제대로 적용됐는지 확인하세요)"

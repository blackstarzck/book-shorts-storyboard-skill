# 똑똑 피드 납품 규격

## 영상

- 9:16, **1440×2560** 권장 (H3 1440p). 15초. mp4 (H.264 + AAC)
- 관리자 → 게시물 → 영상 게시물 → mp4 업로드 → Supabase Storage. 피드에서 음소거 자동재생·루프
- 소리는 음소거 버튼을 눌러야 들린다 → **자막 없으면 내용 전달 실패**. 자막은 필수

## 세이프영역 — 실측 근거

`src/components/feed/upload-video.tsx`가 `object-cover`. 컨테이너(375×755, BottomNav 56px 제외)는
9:16보다 세로로 길어 **영상이 높이에 맞춰지고 좌우가 잘린다**.

| 기기 | 컨테이너 | 렌더 폭 | 크롭/변 |
|---|---|---|---|
| 375×812 | 375×755 | 424.7 | 5.85% |
| 393×852 | 393×795 | 447.2 | 6.06% |
| 430×932 | 430×875 | 492.2 | 6.3% |

크롬(`src/components/feed/chrome.ts` `CHROME_SAFE_AREA`): 좌우 60px(레일 8+44+8),
하단 96px(바 12+76+8), 상단 20px. 음소거 버튼 상단 14+44=58px.

1440×2560 기준 (최악값 + 여유):

| 항목 | 비율 | 픽셀 |
|---|---|---|
| 자막 좌우 인셋 | 20% (크롭 6 + 크롬 14) | 288 |
| 자막 하단 금지 | 15% | 384 |
| 상단 금지 | 10% | 256 |
| 자막 최대 폭 | 60% | 864 |
| 피사체 세이프 | 중앙 88% | 좌우 86px 밖 금지 |

→ H3 프롬프트에 "central 88%" 지시 (렌더러가 자동 삽입).

## ASS 스타일 — `ttokttok` 프로파일

좌표는 코드에 박혀 있지 않다. `scripts/lib/profile.mjs`의 내장 프로파일이 들고 있고,
`storyboard.json`의 `delivery` 필드나 `--profile`로 고른다.

```jsonc
// profile.mjs 의 ttokttok
{
  "canvas":    { "width": 1440, "height": 2560 },
  "subtitle":  { "font": "Malgun Gothic", "size": 72, "outline": 6, "shadow": 0,
                 "marginX": 288, "marginV": 384, "maxLines": 2, "align": "bottom-center",
                 "color": "#FFFFFF", "outlineColor": "#000000", "shadowColor": "#00000080" },
  "titleCard": { "size": 96, "outline": 8, "shadow": 0, "align": "middle-center", "marginV": 0 },
  "framing":   { "cropPerSide": 0.06 }
}
```

| 스타일 | 폰트 | 크기 | 외곽선 | 정렬 | 마진 L/R/V |
|---|---|---|---|---|---|
| Sub | Malgun Gothic Bold | 72 | 6 검정 | `bottom-center` (2) | 288 / 288 / 384 |
| Title | Malgun Gothic Bold | 96 | 8 검정 | `middle-center` (5) | 288 / 288 / 0 |

**유도되는 값** — 좌표를 바꾸면 자동으로 따라온다. 따로 적어두지 않는다.

| 값 | 계산 | ttokttok |
|---|---|---|
| 줄당 글자수 | `(width - marginX×2) ÷ size` | (1440-576) ÷ 72 = **12자** |
| 구도 세이프 | `(1 - cropPerSide×2) × 100` | (1-0.12) × 100 = **중앙 88%** |
| ASS 색 | hex → `&HAABBGGRR` (BGR 역순, 알파 반전) | `#FFFFFF` → `&H00FFFFFF` |
| CSS 폰트 스택 | 자막 폰트 + 제목 폰트 + `fonts.webStack` | `"Malgun Gothic", "Noto Sans KR", …` |
| ffmpeg 필터 | `fonts.dir` 있으면 `fontsdir=` 추가 | `ass=subtitles.ass` |
| ASS 정렬 | 이름 → 숫자패드 1~9 | `bottom-center` → `2` |

구도 세이프는 H3 프롬프트에 자동 삽입된다. `cropPerSide`가 0이면 그 문장 자체를 넣지
않는다 — "중앙 100%"는 무의미하기 때문이다.

- `marginV`는 정렬된 기준 변에서의 거리다. 하단 정렬이면 아래에서, 상단 정렬이면 위에서.
  예전 이름 `marginBottom`도 별칭으로 받는다 — 정렬을 열면서 "하단"이 거짓이 됐다
- 파일은 UTF-8 **BOM** (PowerShell 5.1 호환)
- 폰트: `Malgun Gothic`은 Windows 기본이라 별도 설치가 필요 없다. 다른 폰트를 쓰면
  프로파일에 `fonts.dir`를 지정한다 — `burn.ps1`의 `fontsdir=` 인자로 유도된다.
  **libass는 폰트를 못 찾아도 경고 없이 대체한다**, 결과에서 글꼴을 확인할 것
- 색은 hex로 쓴다. ASS 원형(`&HAABBGGRR`)은 BGR 역순에 알파가 뒤집혀 있어 손으로 쓰면 틀린다
- 흰 글자 + 검정 외곽선(명암비 21:1)이 기본값이다. 바꾸면 명암비를 재서 4.5:1 아래면 경고한다.
  영상 위 자막은 배경을 고를 수 없어 외곽선이 글자를 분리하는 유일한 수단이기 때문이다

## 번인 (`burn.ps1`)

```powershell
.\burn.ps1                      # input.mp4 → output.mp4
.\burn.ps1 -In hailuo.mp4 -Out final.mp4
```

`ffmpeg -y -i $In -vf "ass=subtitles.ass" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a copy $Out`
상대 경로를 쓰는 이유: libass 필터 인자의 드라이브 콜론(`C:`) 이스케이프 문제 회피.
ffmpeg 없으면 `winget install Gyan.FFmpeg`.

## 콘티 시트 캡처

`msedge --headless=new --screenshot=… --window-size=1600,<h>`. 높이 = 헤더 140 + 패널×402
(200px 폭 9:16 패널 356 + 패딩 44 + 경계 2) + 푸터 220(근거 4줄까지). 실측(2026-09-04)에서
380/행·푸터 120은 두 번째 근거 줄을 잘랐다. 남는 아래는 `.sheet { min-height: 100vh }`로 흰색.
Edge(`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`) 없으면 Chrome, 둘 다
없으면 HTML만 남기고 경고.

## 제작 절차 (사람)

1. `h3-prompt.txt` → H3에 붙여넣기 (9:16 · 15초 · 1440p). 필요하면 `panels/*.png` 레퍼런스 첨부
2. mp4 다운로드 → `docs/shorts/<slug>/input.mp4`
3. `.\burn.ps1` → `output.mp4`
4. 375px 뷰포트에서 자막이 레일·도서 바에 겹치지 않는지 확인 후 관리자 업로드

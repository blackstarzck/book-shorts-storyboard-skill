# book-shorts-storyboard

도서 소개 **15초 쇼츠** 한 편을 기획부터 자막까지 만들어 주는 [Claude Code](https://claude.com/claude-code) 스킬.

책 정보를 넣으면 **근거가 붙은 컨셉 3안**을 받고, 하나를 고르면 스토리보드·영상 프롬프트·콘티 시트·자막·번인 스크립트가 한 번에 나온다. 영상 생성(MiniMax H3 등)과 업로드만 사람이 한다.

<p align="center">
  <img src="examples/hyeonjingeon-lucky-day/contisheet.png" width="620" alt="현진건 「운수 좋은 날」 콘티 시트">
</p>

<p align="center"><sub>스킬이 생성한 콘티 시트 — 현진건 「운수 좋은 날」</sub></p>

## 설계 원칙

**모델은 `storyboard.json` 하나만 쓴다.** 나머지는 전부 스크립트가 결정론적으로 파생한다.

영상 모델 문법, 자막 좌표, ffmpeg 인자, 패널 프롬프트의 반복 구절은 사람이(모델이) 매번 손으로 쓰면 조용히 틀어진다. 창작(훅·컷·대본·장면 묘사)만 모델이 하고, 문법과 좌표와 조립과 검증은 기계가 한다.

같은 이유로 **한글은 이미지 모델에 맡기지 않는다.** 자막은 ASS로 번인하고, 콘티 시트의 한글은 HTML로 조판한다.

## 왜 15초인가, 그리고 왜 근거인가

일반적인 쇼츠 권장 길이는 20~30초다. 15초는 그보다 짧아서 **줄거리를 요약할 여유가 없다.** 그래서 이 스킬은 요약 대신 **훅 하나만** 판다. 15초 안에 "무슨 책인지"가 아니라 "왜 열어봐야 하는지"만 남기면 성공이다.

컨셉 3안에는 근거 ID가 반드시 붙는다. 근거는 등급으로 나뉜다.

| 등급 | 뜻 | 예 |
|---|---|---|
| **A** | 동료심사 학술 | 정보격차 이론(Loewenstein 1994), 고각성 감정과 확산(Berger & Milkman 2012), 서사 몰입(Green & Brock 2000) |
| **B** | 대규모 산업 데이터 (1차 출처 미확인) | 첫 3초에 71%가 이탈 여부 결정, 3초 유지율 85%↑면 조회수 2.8배 |
| **C** | 업계 주장 (검증 불가) | 트로프 명시 시 인게이지먼트 3배 |

학술 근거와 마케팅 블로그 주장을 같은 무게로 쓰면 그게 더 나쁜 근거가 되므로 등급을 표시한다. 3안은 **서로 다른 주근거**에 기대야 한다. 같은 근거로 3개를 만들면 3안이 아니라 1안의 변주라서 고를 의미가 없다. 이 규칙은 검증기가 기계로 막는다.

## 요구사항

| | 용도 | 필수 |
|---|---|---|
| **Node.js 20+** (24 권장) | 빌드 스크립트. 외부 의존성 0, 내장 모듈만 | 예 |
| **Claude Code** | 스킬 실행 | 예 |
| 영상 모델 접근 | MiniMax H3(Hailuo) 웹 또는 ComfyUI API 노드 | 영상을 만들 때 |
| **ffmpeg** | 자막 번인 (`winget install Gyan.FFmpeg`) | 자막을 입힐 때 |
| **Codex CLI** | 콘티 패널 이미지 생성 (내장 `image_gen`) | 패널을 뽑을 때 |
| **Edge 또는 Chrome** | 콘티 시트 PNG 캡처 (헤드리스) | 시트 이미지를 뽑을 때 |

없어도 스킬은 동작한다. 패널이 없으면 시트에 프롬프트 카드가 들어가고, 브라우저가 없으면 HTML만 남는다. 둘 다 경고로 끝나고 빌드는 성공한다.

## 설치

개인 스킬로 설치하면 모든 프로젝트에서 쓸 수 있다.

```bash
git clone https://github.com/blackstarzck/book-shorts-storyboard-skill.git ~/.claude/skills/book-shorts-storyboard
```

특정 프로젝트에서만 쓰려면 그 프로젝트 안에 둔다. 레포에 같이 버전 관리된다.

```bash
git clone https://github.com/blackstarzck/book-shorts-storyboard-skill.git .claude/skills/book-shorts-storyboard
```

Windows PowerShell이면 `~` 대신 `$HOME`을 쓴다.

설치 후 Claude Code를 새로 시작하면 `/book-shorts-storyboard`로 잡힌다. 실행 중인 세션에는 반영되지 않는다.

설치 확인:

```bash
node --test "~/.claude/skills/book-shorts-storyboard/scripts/**/*.test.mjs"
```

70개가 전부 통과하면 정상이다.

## 사용법

Claude Code에서 스킬을 부르고 책 정보를 준다. 제목·저자·줄거리면 충분하고, 인용구가 있으면 더 좋다.

```
/book-shorts-storyboard

변신 / 프란츠 카프카
어느 날 아침 그레고르 잠자는 불안한 꿈에서 깨어나 자신이 거대한 벌레로
변해 있는 것을 발견한다. 가족은 그를 방에 가두고, 세상은 아무 일 없다는 듯 흘러간다.
```

그러면 이렇게 진행된다.

1. 훅 재료를 뽑는다 — 트로프, 반전 전제, 감정 정점, 첫 장면의 시각적 이상
2. **컨셉 3안을 근거와 함께 제시한다** (훅 유형 × 톤 × 비주얼)
3. 고르면 `storyboard.json`을 쓴다
4. 빌드해서 검증을 통과시킨다
5. 콘티 패널을 생성한다 (선택, 수 분 소요)

빌드는 직접 돌려도 된다.

```bash
node "<스킬 폴더>/scripts/build-storyboard.mjs" <출력 폴더> --no-png
node "<스킬 폴더>/scripts/build-storyboard.mjs" <출력 폴더> --panels
```

| 플래그 | 뜻 |
|---|---|
| `--no-png` | 콘티 시트 PNG 캡처를 건너뛴다. 빠른 반복용 |
| `--panels` | 콘티 패널 이미지를 생성한다 (Codex `image_gen`, 패널당 1~2분) |
| `--force-panels` | 이미 있는 패널도 다시 만든다 |

검증에 실패하면 exit 1로 멈추고 어떤 규칙이 왜 깨졌는지 알려준다. 이때 산출물은 만들지 않는다. 반쪽짜리를 남기지 않기 위해서다.

## 산출물

출력 폴더에 이렇게 생긴다.

| 파일 | 작성자 | 용도 |
|---|---|---|
| `storyboard.json` | **모델** | 유일한 원본. 고칠 것은 이것뿐이다 |
| `storyboard.md` | 스크립트 | 사람이 읽는 기획서 — 컨셉·근거·타임라인·자막·제작 절차 |
| `h3-prompt.txt` | 스크립트 | 영상 모델에 붙여넣을 프롬프트 |
| `panel-prompts.txt` | 스크립트 | 콘티 패널 프롬프트. 어느 이미지 도구에든 이식된다 |
| `panels/panel-NN.png` | Codex | 콘티 그림. 영상 모델 레퍼런스로도 재투입된다 |
| `contisheet.html` / `.png` | 스크립트 | 콘티 시트 (VIDEO │ 패널 │ AUDIO) |
| `subtitles.ass` | 스크립트 | 자막 (UTF-8 BOM) |
| `burn.ps1` | 스크립트 | ffmpeg 번인 스크립트 |
| `build-report.json` | 스크립트 | 검증 결과와 지표 |

`storyboard.json` 외에는 전부 파생물이다. 직접 고치지 말고 JSON을 고쳐 다시 빌드한다.

## 검증 규칙

| ID | 내용 |
|---|---|
| V1 | 샷 2~3개, 0부터 빈틈 없이 연속, 마지막이 duration(4~15 정수)과 일치 |
| V2 | 내레이션 **한글 75음절 이하** — 5.5음절/초 × 15초에서 호흡 여유를 뺀 값 |
| V3 | 자막 큐 최대 2줄 × 12자, 0.8초 이상, 겹침 없음 |
| V4 | 조립된 프롬프트 7,000자 이하 |
| V5 | 컨셉 3개, 근거 ID 실재, **주근거·훅 유형 중복 없음** |
| V6 | 샷당 카메라 1개, 정해진 18개 타입 중 하나 |
| V7 | 패널 4~6개, 샷 참조 유효, `style_lock` 존재 |
| V8 | 제목 카드가 마지막 샷 구간 안 |
| V9 | 제목과 슬러그 |

V2가 가장 자주 걸린다. **"15초 안에 줄거리 설명"이 실패하는 지점은 거의 항상 대본이 길어서**고, 눈으로는 안 잡힌다.

## 다른 앱에 맞추기

자막 좌표는 특정 피드 UI에 맞춰 실측한 값이다. 다른 곳에 쓰려면 두 파일을 고친다.

`references/ttokttok-delivery.md`에 좌표 산출 근거가 있고, `scripts/lib/render-ass.mjs`에 실제 값이 있다.

| 항목 | 현재 값 (1440×2560 기준) | 근거 |
|---|---|---|
| 자막 좌우 인셋 | 288px (20%) | 플레이어의 `object-cover` 좌우 크롭 6% + UI 크롬 14% |
| 자막 하단 금지 | 384px (15%) | 하단 정보 바 |
| 피사체 세이프 | 중앙 88% | 좌우 크롭 |

세로 영상이 세로로 더 긴 컨테이너에서 `object-cover`로 표시되면 **좌우가 잘린다.** 그래서 영상 프롬프트에 "중요 피사체·얼굴은 중앙 88% 안에"가 자동으로 들어간다. 이 계산이 다른 앱에서도 필요한지 먼저 확인하는 게 좋다.

## 알려진 한계

**자막과 음성이 어긋날 수 있다.** MiniMax H3는 샷별 대사를 한 덩어리로 받아 **스스로 속도를 정해** 읽는데, 자막은 우리가 계획한 타임코드로 번인된다. 일치한다는 보장이 없다. 영상을 받아 어긋난 정도를 재고 `narration[].start/end`를 맞춘 뒤 다시 빌드하면 된다.

**한국어 TTS 품질은 미검증이다.** H3가 한국어를 공식 지원한다는 것만 확인했다.

**프리셋 문구를 고치면 룩이 바뀐다.** `ink-line-art`에서 배경 한 구절만 바꿨더니 얇은 선화가 아니라 짙은 목탄화가 나왔다. 프롬프트는 여전히 "thin clean strokes"라고 말하고 있었다. 프리셋을 손봤다면 전량 생성 전에 **한 장만 뽑아 확인**한다.

**음절 5.5/초는 뉴스 낭독 기준 근사치다.** 실제 영상에서 재보고 조정할 값이다.

## 예제

| 예제 | 컨셉 | 특징 |
|---|---|---|
| [`examples/kafka-metamorphosis/`](examples/kafka-metamorphosis/) | curiosity-gap × unsettling × ink-line-art | 스키마 정본. 얇은 선화 |
| [`examples/hyeonjingeon-lucky-day/`](examples/hyeonjingeon-lucky-day/) | curiosity-gap × unsettling × charcoal-noir | 실제 도서 데이터. 목탄 톤 |

패널 원본(`panels/*.png`)은 용량 때문에 제외했다. `--panels`로 다시 생성할 수 있다.

## 참조 문서

| 문서 | 내용 |
|---|---|
| `SKILL.md` | 워크플로와 제약 |
| `references/hook-playbook.md` | 훅 유형 8종, 톤 6종, 비주얼 프리셋 7종, 증거 요약과 충돌 해소 |
| `references/evidence.json` | 근거 ID 정본 — 등급·주장·출처 |
| `references/h3-prompt-spec.md` | MiniMax H3 문법 |
| `references/conti-panel-spec.md` | 패널 프롬프트 조립과 Codex 호출 |
| `references/ttokttok-delivery.md` | 세이프영역 실측, ASS 스타일, 납품 절차 |

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Speech

$demoDir = Join-Path $Root 'public\demo'
$workDir = Join-Path $demoDir '.submission-video'
$outputPath = Join-Path $demoDir 'petbattle-submission-en.mp4'
$voicePath = Join-Path $workDir 'voiceover.wav'
$visualPath = Join-Path $workDir 'visuals.mp4'
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

function New-Slide {
  param(
    [string]$Path,
    [string]$Eyebrow,
    [string]$Title,
    [string]$Body,
    [string]$Footer = 'tatelog.github.io/petbattle'
  )

  $bitmap = New-Object System.Drawing.Bitmap 1280, 720
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::FromArgb(7, 10, 16))

  $cyan = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(105, 231, 255))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248, 246, 239))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(174, 184, 198))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(247, 188, 82))
  $panel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(19, 25, 36))
  $line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(65, 85, 105)), 2
  $titleFont = New-Object System.Drawing.Font 'Arial', 53, ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font 'Arial', 23, ([System.Drawing.FontStyle]::Regular)
  $eyebrowFont = New-Object System.Drawing.Font 'Arial', 15, ([System.Drawing.FontStyle]::Bold)
  $footerFont = New-Object System.Drawing.Font 'Arial', 14, ([System.Drawing.FontStyle]::Regular)

  $graphics.FillEllipse($cyan, -100, -140, 390, 390)
  $graphics.FillEllipse($gold, 1110, 570, 250, 250)
  $graphics.FillRectangle($panel, 70, 66, 1140, 588)
  $graphics.DrawRectangle($line, 70, 66, 1140, 588)
  $graphics.DrawString($Eyebrow.ToUpperInvariant(), $eyebrowFont, $cyan, 116, 112)
  $graphics.DrawString($Title, $titleFont, $white, (New-Object System.Drawing.RectangleF 108, 162, 1060, 165))
  $graphics.DrawString($Body, $bodyFont, $muted, (New-Object System.Drawing.RectangleF 112, 350, 1048, 190))
  $graphics.DrawString($Footer, $footerFont, $gold, 112, 598)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $titleFont.Dispose(); $bodyFont.Dispose(); $eyebrowFont.Dispose(); $footerFont.Dispose()
  $cyan.Dispose(); $white.Dispose(); $muted.Dispose(); $gold.Dispose(); $panel.Dispose(); $line.Dispose()
  $graphics.Dispose(); $bitmap.Dispose()
}

New-Slide -Path (Join-Path $workDir 'title.png') `
  -Eyebrow 'OpenAI Build Week | Education' `
  -Title 'PETBATTLE' `
  -Body 'Turn any visual creation into a playable PET. Battle with meaning - not file size - and unlock new creative media by learning.'

New-Slide -Path (Join-Path $workDir 'architecture.png') `
  -Eyebrow 'Explainable AI architecture' `
  -Title 'GPT-5.6 reads meaning. Rules decide power.' `
  -Body 'Browser to optional Cloudflare Worker to GPT-5.6 Luna structured semantics to Zod validation to deterministic PET stats. API-free local analysis remains fully playable.'

New-Slide -Path (Join-Path $workDir 'codex.png') `
  -Eyebrow 'Built with Codex' `
  -Title 'From unfinished concept to coherent product' `
  -Body 'Codex helped implement the 3D arena, battle engine, Worker boundary, progression, SVG learning quest, tests, browser QA, localization, demo assets, and GitHub Pages deployment.'

New-Slide -Path (Join-Path $workDir 'closing.png') `
  -Eyebrow 'PETBATTLE' `
  -Title 'Understand. Create. Return to the arena.' `
  -Body 'Play now without an account or API key. Source code and judge instructions are public.' `
  -Footer 'tatelog.github.io/petbattle | github.com/tatelog/petbattle'

$narration = @'
PETBATTLE turns any visual creation into a playable expression token, and turns progression into learning.

Most generative systems reward producing more. PETBATTLE deliberately does not. File size, resolution, and raw token usage never become battle power. Instead, the artifact is interpreted into a limited set of meaningful essences. Deterministic rules then create explainable Physical, Magic, Defense, and health parameters.

The complete core experience runs on GitHub Pages with no API key. I can summon an image through a magic circle, inspect only my own PET parameters, and start a CPU battle. The opponent stays sealed until battle begins.

The camera descends from an aerial view into a Three dot J S colosseum. I choose Physical, Magic, or Defense. Physical interrupts Magic, Magic pierces Defense, and Defense counters Physical. Battle effects and fullscreen controls keep the commands inside the arena.

One match cannot instantly maximize the PET. Battles award bounded experience and record action mastery. At Core Level Two, PETBATTLE unlocks a source-image-free S V G Evolution Quest. The learner chooses a theme and focus, then follows Observe, Decompose, Build, and Verify guidance. The resulting safe S V G and a written reflection become portfolio evidence, and can be summoned into the next battle.

G P T Five point Six Luna is integrated through a Cloudflare Worker for structured semantic recognition. Luna proposes meaning. Validated deterministic code calculates the stats. The key never enters the browser, and a local analyzer keeps the experience reliable when the A P I is absent.

Codex was my primary engineering partner. In one build thread, I used it to redesign the product, implement the 3D arena and battle engine, create the secure A I boundary, add progression and educational quests, write tests, perform browser quality assurance, add English and Japanese themes, and deploy the public app. I made the product decisions that keep the system fair, explainable, and educational.

Today PETBATTLE teaches raster and vector thinking. Next, Core Levels can unlock code effects, 3D models, and structured formats such as P D F and I F C, each with its own validator, learning objective, and creative challenge.

PETBATTLE. Understand what you made, learn a new way to express it, and bring it back to the arena.
'@

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq 'Microsoft Zira Desktop' } | Select-Object -First 1
if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }
$synth.Rate = 1
$synth.Volume = 100
$synth.SetOutputToWaveFile($voicePath)
$synth.Speak($narration)
$synth.Dispose()

$segments = @(
  @{ Image = (Join-Path $workDir 'title.png'); Duration = 8 },
  @{ Image = (Join-Path $demoDir 'petbattle-demo-poster.jpg'); Duration = 15 },
  @{ Video = (Join-Path $demoDir 'petbattle-demo.mp4') },
  @{ Image = (Join-Path $demoDir 'petbattle-api-free-mode.jpg'); Duration = 15 },
  @{ Image = (Join-Path $demoDir 'petbattle-battle-fullscreen.jpg'); Duration = 15 },
  @{ Image = (Join-Path $demoDir 'petbattle-progression-result.jpg'); Duration = 15 },
  @{ Image = (Join-Path $demoDir 'petbattle-evolution-studio.jpg'); Duration = 20 },
  @{ Image = (Join-Path $workDir 'architecture.png'); Duration = 20 },
  @{ Image = (Join-Path $workDir 'codex.png'); Duration = 15 },
  @{ Image = (Join-Path $workDir 'closing.png'); Duration = 12 }
)

$segmentFiles = @()
for ($index = 0; $index -lt $segments.Count; $index += 1) {
  $segment = $segments[$index]
  $segmentPath = Join-Path $workDir ('segment-{0:D2}.mp4' -f $index)
  $segmentFiles += $segmentPath
  $videoFilter = 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x070A10,setsar=1,fps=30'
  if ($segment.Image) {
    & ffmpeg -loglevel error -y -loop 1 -i $segment.Image -t $segment.Duration -vf $videoFilter -an -c:v libx264 -preset medium -pix_fmt yuv420p -r 30 $segmentPath
  } else {
    & ffmpeg -loglevel error -y -i $segment.Video -vf $videoFilter -an -c:v libx264 -preset medium -pix_fmt yuv420p -r 30 $segmentPath
  }
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed while creating $segmentPath" }
}

$concatPath = Join-Path $workDir 'segments.txt'
$concatLines = $segmentFiles | ForEach-Object { "file '$($_.Replace('\', '/'))'" }
[System.IO.File]::WriteAllLines($concatPath, $concatLines, (New-Object System.Text.UTF8Encoding($false)))
& ffmpeg -loglevel error -y -f concat -safe 0 -i $concatPath -c copy $visualPath
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg failed while concatenating visual segments' }

& ffmpeg -loglevel error -y -i $visualPath -i $voicePath -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $outputPath
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg failed while muxing narration' }

$duration = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $outputPath
Write-Host "Created $outputPath ($([math]::Round([double]$duration, 1)) seconds)"

param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Speech

$demoDir = Join-Path $Root 'public\demo'
$workDir = Join-Path $demoDir '.submission-video'
$recordedDir = Join-Path $workDir 'recorded'
$outputPath = Join-Path $demoDir 'petbattle-submission-en.mp4'
$captionPath = Join-Path $demoDir 'petbattle-submission-en.srt'
$narrationPath = Join-Path $workDir 'narration.wav'
$visualPath = Join-Path $workDir 'visuals.mp4'
$dividerSeconds = 1.2
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

function New-CinematicSlide {
  param(
    [string]$Path,
    [string]$Kicker,
    [string]$Title,
    [string]$Body,
    [string]$Number = '',
    [string]$Footer = 'tatelog.github.io/petbattle'
  )

  $bitmap = New-Object System.Drawing.Bitmap 1280, 720
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $bounds = New-Object System.Drawing.Rectangle 0, 0, 1280, 720
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $bounds, ([System.Drawing.Color]::FromArgb(5, 9, 16)), ([System.Drawing.Color]::FromArgb(17, 31, 45)), 18
  $graphics.FillRectangle($gradient, $bounds)

  $cyan = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(105, 231, 255))
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(249, 248, 243))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(178, 190, 204))
  $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(247, 188, 82))
  $ghost = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 105, 231, 255))
  $gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(13, 105, 231, 255)), 1
  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 105, 231, 255)), 3
  $titleFont = New-Object System.Drawing.Font 'Arial', 54, ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Object System.Drawing.Font 'Arial', 23, ([System.Drawing.FontStyle]::Regular)
  $kickerFont = New-Object System.Drawing.Font 'Arial', 15, ([System.Drawing.FontStyle]::Bold)
  $numberFont = New-Object System.Drawing.Font 'Arial', 176, ([System.Drawing.FontStyle]::Bold)
  $footerFont = New-Object System.Drawing.Font 'Arial', 14, ([System.Drawing.FontStyle]::Regular)

  for ($x = 0; $x -le 1280; $x += 64) { $graphics.DrawLine($gridPen, $x, 0, $x, 720) }
  for ($y = 0; $y -le 720; $y += 64) { $graphics.DrawLine($gridPen, 0, $y, 1280, $y) }
  $graphics.FillPolygon($cyan, @(
    (New-Object System.Drawing.Point 0, 0),
    (New-Object System.Drawing.Point 255, 0),
    (New-Object System.Drawing.Point 150, 720),
    (New-Object System.Drawing.Point 0, 720)
  ))
  $graphics.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(225, 7, 12, 20))), 44, 42, 1192, 636)
  $graphics.DrawLine($linePen, 104, 126, 1176, 126)
  if ($Number) { $graphics.DrawString($Number, $numberFont, $ghost, 930, 132) }
  $graphics.DrawString('PETBATTLE', $kickerFont, $gold, 104, 78)
  $graphics.DrawString($Kicker.ToUpperInvariant(), $kickerFont, $cyan, 104, 158)
  $graphics.DrawString($Title, $titleFont, $white, (New-Object System.Drawing.RectangleF 96, 212, 1010, 170))
  $graphics.DrawString($Body, $bodyFont, $muted, (New-Object System.Drawing.RectangleF 102, 420, 980, 120))
  $graphics.DrawString($Footer, $footerFont, $gold, 102, 610)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $titleFont.Dispose(); $bodyFont.Dispose(); $kickerFont.Dispose(); $numberFont.Dispose(); $footerFont.Dispose()
  $cyan.Dispose(); $white.Dispose(); $muted.Dispose(); $gold.Dispose(); $ghost.Dispose(); $gridPen.Dispose(); $linePen.Dispose(); $gradient.Dispose()
  $graphics.Dispose(); $bitmap.Dispose()
}

function Get-MediaDuration([string]$Path) {
  return [double](& ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $Path)
}

function Format-SrtTime([double]$Seconds) {
  $span = [TimeSpan]::FromSeconds($Seconds)
  return '{0:00}:{1:00}:{2:00},{3:000}' -f [math]::Floor($span.TotalHours), $span.Minutes, $span.Seconds, $span.Milliseconds
}

function Split-CaptionText([string]$Text, [int]$Limit = 72) {
  $groups = New-Object System.Collections.Generic.List[string]
  $current = ''
  foreach ($word in ($Text.Trim() -split '\s+')) {
    if ($current.Length -gt 0 -and ($current.Length + 1 + $word.Length) -gt $Limit) {
      $groups.Add($current)
      $current = $word
    } else {
      $current = if ($current) { "$current $word" } else { $word }
    }
  }
  if ($current) { $groups.Add($current) }
  return $groups
}

function Wrap-Caption([string]$Text, [int]$LineLength = 44) {
  $words = $Text -split '\s+'
  $lines = New-Object System.Collections.Generic.List[string]
  $line = ''
  foreach ($word in $words) {
    if ($line.Length -gt 0 -and ($line.Length + 1 + $word.Length) -gt $LineLength) {
      $lines.Add($line)
      $line = $word
    } else {
      $line = if ($line) { "$line $word" } else { $word }
    }
  }
  if ($line) { $lines.Add($line) }
  return $lines -join [Environment]::NewLine
}

$titleSlide = Join-Path $workDir 'title-new.png'
$trustSlide = Join-Path $workDir 'trust-new.png'
$codexSlide = Join-Path $workDir 'codex-new.png'
$closingSlide = Join-Path $workDir 'closing-new.png'

New-CinematicSlide $titleSlide 'OpenAI Build Week | Education' 'Every creation can become a learner.' 'Turn an image into a playable PET. Battle with meaning. Unlock a new creative medium by learning.' ''
New-CinematicSlide $trustSlide 'Explainable AI boundary' 'AI proposes meaning. Rules decide power.' 'Optional GPT-5.6 Luna semantics are validated by Zod, then deterministic code calculates PET stats. The local path stays fully playable.' '05'
New-CinematicSlide $codexSlide 'Built with Codex' 'Design. Implement. Test. Deploy.' 'Codex accelerated the 3D arena, battle engine, secure Worker boundary, progression, localization, browser QA, media, and GitHub Pages delivery.' '06'
New-CinematicSlide $closingSlide 'PETBATTLE' 'Understand. Create. Return to the arena.' 'Play the complete CPU experience without an account or API key.' '07' 'tatelog.github.io/petbattle | github.com/tatelog/petbattle'

$dividerData = @(
  @{ File = 'divider-01.png'; Kicker = '01 / Summon'; Title = 'Image to meaning to PET'; Body = 'Start from a clean session. Meet your creation before you meet the opponent.'; Number = '01' },
  @{ File = 'divider-02.png'; Kicker = '02 / Battle'; Title = 'The rival stays sealed'; Body = 'Descend into the colosseum, reveal both PETs, then read the counter loop.'; Number = '02' },
  @{ File = 'divider-03.png'; Kicker = '03 / Learn'; Title = 'Practice becomes progression'; Body = 'Bounded XP and action mastery make repeated decisions matter.'; Number = '03' },
  @{ File = 'divider-04.png'; Kicker = '04 / Evolve'; Title = 'Unlock a medium by making with it'; Body = 'Observe, decompose, build, verify, reflect, and keep the evidence.'; Number = '04' },
  @{ File = 'divider-05.png'; Kicker = '05 / Trust'; Title = 'Meaning is not authority'; Body = 'GPT-5.6 interprets. Validation and fixed rules decide the game.'; Number = '05' },
  @{ File = 'divider-06.png'; Kicker = '06 / Codex'; Title = 'One build thread, full delivery loop'; Body = 'Product design through implementation, QA, media, and deployment.'; Number = '06' },
  @{ File = 'divider-07.png'; Kicker = '07 / Impact'; Title = 'Creative literacy as a game loop'; Body = 'Raster and vector today. Code, 3D, PDF, and IFC as future learning quests.'; Number = '07' }
)
foreach ($divider in $dividerData) {
  New-CinematicSlide (Join-Path $workDir $divider.File) $divider.Kicker $divider.Title $divider.Body $divider.Number
}

$chapters = @(
  @{ Id = 'hook'; Section = ''; Divider = $null; Visual = $titleSlide; Kind = 'image'; Voice = 'What if every image could become a creature, and learning a new format made it stronger? This is PETBATTLE, an education game about understanding what you create.' },
  @{ Id = 'summon'; Section = '01 / SUMMON'; Divider = (Join-Path $workDir 'divider-01.png'); Visual = (Join-Path $recordedDir 'summon.mp4'); Kind = 'video'; Voice = 'Starting from a clean Level One session, I switch to English and summon a visual creation through the magic circle. PETBATTLE turns visual meaning into a bounded set of essences, then shows only my own PET and its explainable Physical, Magic, Defense, and health parameters. File size, image resolution, and raw token usage never add battle power. The complete CPU loop works on GitHub Pages without an account or API key.' },
  @{ Id = 'battle'; Section = '02 / BATTLE'; Divider = (Join-Path $workDir 'divider-02.png'); Visual = (Join-Path $recordedDir 'battle.mp4'); Kind = 'video'; Voice = 'The opponent stays sealed until I enter the colosseum. The camera spirals down from an aerial view, my PET arrives, and the rival is revealed only at battle start. Physical interrupts Magic. Magic pierces Defense. Defense counters Physical. The commands, health, effects, and result all stay inside one readable arena experience.'; CaptionTop = $true },
  @{ Id = 'learn'; Section = '03 / LEARN'; Divider = (Join-Path $workDir 'divider-03.png'); Visual = (Join-Path $recordedDir 'progression.mp4'); Kind = 'video'; Voice = 'A result records bounded experience and mastery for the actions I actually used. One match cannot maximize the PET. In this same clean browser session, repeated real battles reached one hundred ninety experience and unlocked Core Level Two. The roadmap connects each future format to a concrete learning theme instead of making it a cosmetic upgrade.' },
  @{ Id = 'evolve'; Section = '04 / EVOLVE'; Divider = (Join-Path $workDir 'divider-04.png'); Visual = (Join-Path $recordedDir 'evolution.mp4'); Kind = 'video'; Voice = 'Level Two opens a source-image-free SVG Evolution Quest. I choose a theme and a learning focus, then follow Observe, Decompose, Build, and Verify guidance. I explain why the model remains readable at thumbnail size, save the reflection as portfolio evidence, and evolve the PET. The unlock is not permission to upload a new extension. It is a guided reason to learn how that representation works.' },
  @{ Id = 'trust'; Section = '05 / TRUST'; Divider = (Join-Path $workDir 'divider-05.png'); Visual = $trustSlide; Kind = 'image'; Voice = 'GPT-5.6 Luna is an optional semantic interpreter behind a Cloudflare Worker. It proposes a small structured description. Zod validates that response, and deterministic code calculates the stats. The OpenAI key never reaches the browser. When the model or Worker is absent, the local analyzer keeps the complete core game playable. AI helps read meaning, but it never becomes an opaque judge of student work.' },
  @{ Id = 'codex'; Section = '06 / BUILT WITH CODEX'; Divider = (Join-Path $workDir 'divider-06.png'); Visual = $codexSlide; Kind = 'image'; Voice = 'Codex was my primary engineering partner in the main build thread. I used it to redesign the unfinished concept, implement the Three.js arena and deterministic battle engine, create the secure AI boundary, add progression and the SVG learning quest, write tests, perform browser quality assurance, localize the interface, generate the submission media, and deploy the public app. I made the product decisions that keep it fair, explainable, and educational.' },
  @{ Id = 'close'; Section = '07 / IMPACT'; Divider = (Join-Path $workDir 'divider-07.png'); Visual = $closingSlide; Kind = 'image'; Voice = 'Today PETBATTLE teaches raster and vector thinking. Next, the same loop can unlock code effects, 3D models, PDF, and IFC, each with its own validator, learning objective, and creative challenge. Understand what you made. Learn a new way to express it. Return to the arena.' }
)

foreach ($chapter in $chapters) {
  if ($chapter.Kind -eq 'video' -and -not (Test-Path $chapter.Visual)) {
    throw "Missing clean recording: $($chapter.Visual). Run node scripts/record-demo-clips.mjs first."
  }
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.SelectVoice('Microsoft Zira Desktop')
} catch {
  $synth.SelectVoiceByHints(
    [System.Speech.Synthesis.VoiceGender]::Female,
    [System.Speech.Synthesis.VoiceAge]::Adult,
    0,
    [System.Globalization.CultureInfo]::GetCultureInfo('en-US')
  )
}
$synth.Rate = 2
$synth.Volume = 100

$audioParts = New-Object System.Collections.Generic.List[string]
$visualParts = New-Object System.Collections.Generic.List[string]
$captionLines = New-Object System.Collections.Generic.List[string]
$timeline = 0.0
$captionIndex = 1

$silencePath = Join-Path $workDir 'divider-silence.wav'
& ffmpeg -loglevel error -y -f lavfi -i 'anullsrc=r=22050:cl=mono' -t $dividerSeconds -c:a pcm_s16le $silencePath
if ($LASTEXITCODE -ne 0) { throw 'Failed to create divider silence' }

for ($index = 0; $index -lt $chapters.Count; $index += 1) {
  $chapter = $chapters[$index]
  if ($chapter.Divider) {
    $audioParts.Add($silencePath)
    $dividerVideo = Join-Path $workDir ('visual-{0:D2}-divider.mp4' -f $index)
    $fadeStart = [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0:0.00}', $dividerSeconds - 0.25)
    $dividerFilter = "scale=1280:720,setsar=1,fps=30,fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeStart}:d=0.25"
    & ffmpeg -loglevel error -y -loop 1 -i $chapter.Divider -t $dividerSeconds -vf $dividerFilter -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 $dividerVideo
    if ($LASTEXITCODE -ne 0) { throw "Failed to render divider $($chapter.Id)" }
    $visualParts.Add($dividerVideo)
    $timeline += $dividerSeconds
  }

  $speechPath = Join-Path $workDir ('speech-{0:D2}-{1}.wav' -f $index, $chapter.Id)
  $synth.SetOutputToWaveFile($speechPath)
  $synth.Speak($chapter.Voice)
  $synth.SetOutputToNull()
  $speechDuration = Get-MediaDuration $speechPath
  $audioParts.Add($speechPath)

  $visualVideo = Join-Path $workDir ('visual-{0:D2}-{1}.mp4' -f $index, $chapter.Id)
  $fadeStart = [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0:0.00}', [math]::Max(0.1, $speechDuration - 0.35))
  $labelFilter = if ($chapter.Section) { ",drawtext=font='Arial':text='$($chapter.Section)':fontcolor=0x69E7FF:fontsize=18:box=1:boxcolor=0x07101CCC:boxborderw=10:x=(w-tw)/2:y=18" } else { '' }
  if ($chapter.Kind -eq 'video') {
    $filter = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x050910,tpad=stop_mode=clone:stop_duration=60,setsar=1,fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeStart}:d=0.35$labelFilter"
    & ffmpeg -loglevel error -y -i $chapter.Visual -t $speechDuration -vf $filter -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 $visualVideo
  } else {
    $frameCount = [math]::Ceiling($speechDuration * 30)
    $filter = "scale=1344:756,zoompan=z='min(zoom+0.00012,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frameCount}:s=1280x720:fps=30,setsar=1,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeStart}:d=0.35$labelFilter"
    & ffmpeg -loglevel error -y -loop 1 -i $chapter.Visual -t $speechDuration -vf $filter -an -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 $visualVideo
  }
  if ($LASTEXITCODE -ne 0) { throw "Failed to render visual chapter $($chapter.Id)" }
  $visualParts.Add($visualVideo)

  $captionGroups = Split-CaptionText $chapter.Voice
  $captionDuration = $speechDuration / $captionGroups.Count
  for ($groupIndex = 0; $groupIndex -lt $captionGroups.Count; $groupIndex += 1) {
    $start = $timeline + ($groupIndex * $captionDuration)
    $end = [math]::Min($timeline + $speechDuration, $start + $captionDuration - 0.08)
    $alignment = if ($chapter.CaptionTop) { '{\an8}' } else { '{\an2}' }
    $captionLines.Add([string]$captionIndex)
    $captionLines.Add("$(Format-SrtTime $start) --> $(Format-SrtTime $end)")
    $captionLines.Add($alignment + (Wrap-Caption $captionGroups[$groupIndex]))
    $captionLines.Add('')
    $captionIndex += 1
  }
  $timeline += $speechDuration
}
$synth.Dispose()

if ($captionLines.Count -gt 0 -and $captionLines[$captionLines.Count - 1] -eq '') {
  $captionLines.RemoveAt($captionLines.Count - 1)
}
[System.IO.File]::WriteAllLines($captionPath, $captionLines, (New-Object System.Text.UTF8Encoding($false)))

$audioListPath = Join-Path $workDir 'audio-parts.txt'
$audioList = $audioParts | ForEach-Object { "file '$($_.Replace('\', '/'))'" }
[System.IO.File]::WriteAllLines($audioListPath, $audioList, (New-Object System.Text.UTF8Encoding($false)))
& ffmpeg -loglevel error -y -f concat -safe 0 -i $audioListPath -c copy $narrationPath
if ($LASTEXITCODE -ne 0) { throw 'Failed to concatenate new narration' }

$visualListPath = Join-Path $workDir 'visual-parts.txt'
$visualList = $visualParts | ForEach-Object { "file '$($_.Replace('\', '/'))'" }
[System.IO.File]::WriteAllLines($visualListPath, $visualList, (New-Object System.Text.UTF8Encoding($false)))
& ffmpeg -loglevel error -y -f concat -safe 0 -i $visualListPath -c copy $visualPath
if ($LASTEXITCODE -ne 0) { throw 'Failed to concatenate new visual chapters' }

Push-Location $Root
try {
  $captionFilter = "subtitles='public/demo/petbattle-submission-en.srt':force_style='FontName=Arial,FontSize=21,PrimaryColour=&H00FFFFFF,OutlineColour=&H00101820,BackColour=&HA0000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=38'"
  & ffmpeg -loglevel error -y -i $visualPath -i $narrationPath -vf $captionFilter -filter_complex '[1:a]loudnorm=I=-16:TP=-1.5:LRA=7[a]' -map 0:v -map '[a]' -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart $outputPath
  if ($LASTEXITCODE -ne 0) { throw 'Failed to burn new captions and mux the new narration' }
} finally {
  Pop-Location
}

$duration = Get-MediaDuration $outputPath
if ($duration -ge 180) { throw "Submission video is too long: $duration seconds" }
Write-Host "Created fully rebuilt demo: $outputPath ($([math]::Round($duration, 1)) seconds)"

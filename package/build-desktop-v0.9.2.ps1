param(
  [string]$SourceDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$WorkDir = (Join-Path (Split-Path -Parent $SourceDir) 'fritia_online_next_desktop\v1.0.0'),
  [string]$Version = '0.9.2',
  [string]$Title = '',
  [string]$ProductName = '',
  [string]$OutputName = 'Fritia Online NEXT Ver. 0.9.2 Preview Portable.exe'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Title)) {
  $Title = [System.Text.Encoding]::UTF8.GetString([byte[]]@(232,138,153,230,143,144,233,155,133,32,79,78,76,73,78,69,32,78,69,88,84,32,86,101,114,46,32,48,46,57,46,50,32,40,80,114,101,118,105,101,119,32,86,101,114,115,105,111,110,41,32,124,32,233,157,146,229,176,152,229,183,165,228,189,156,229,174,164))
}
if ([string]::IsNullOrWhiteSpace($ProductName)) {
  $ProductName = [System.Text.Encoding]::UTF8.GetString([byte[]]@(232,138,153,230,143,144,233,155,133,32,79,78,76,73,78,69,32,78,69,88,84))
}

$PackageDir = Join-Path $SourceDir 'package'
$BuildDir = Join-Path $WorkDir 'build'
$AppDir = Join-Path $WorkDir 'app'
$BuildOutDir = Join-Path $WorkDir 'dist_v0.9.2_build'
$FinalDir = Join-Path $WorkDir 'dist_v0.9.2'
$LoaderDir = Join-Path $WorkDir 'loader\v0.9.2'
$PayloadZip = Join-Path $BuildOutDir 'payload-v0.9.2.zip'
$FinalExe = Join-Path $FinalDir $OutputName

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command '$Name'. $InstallHint"
  }
}

function Copy-DirectoryContent($From, $To) {
  if (Test-Path -LiteralPath $To) { Remove-Item -LiteralPath $To -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  Get-ChildItem -LiteralPath $From -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $To $_.Name) -Recurse -Force
  }
}

function Write-Utf8NoBom($Path, $Text) {
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

Assert-Command node 'Install Node.js 20 LTS or newer.'
Assert-Command npm 'Install Node.js 20 LTS or newer.'
Assert-Command cargo 'Install Rust stable x86_64-pc-windows-msvc with rustup and Visual Studio Build Tools.'

New-Item -ItemType Directory -Force -Path $WorkDir, $BuildDir, $FinalDir | Out-Null
Copy-Item -LiteralPath (Join-Path $PackageDir 'favicon.ico') -Destination (Join-Path $BuildDir 'favicon.ico') -Force
Copy-Item -LiteralPath (Join-Path $PackageDir 'favicon_runtime.ico') -Destination (Join-Path $BuildDir 'favicon_runtime.ico') -Force
Copy-Item -LiteralPath (Join-Path $PackageDir 'portableSplash_1280x720.bmp') -Destination (Join-Path $BuildDir 'portableSplash_1280x720.bmp') -Force

foreach ($name in @('css','js','src','ui')) {
  Copy-DirectoryContent (Join-Path $SourceDir $name) (Join-Path $AppDir $name)
}
foreach ($file in @('index.html','favicon.ico','README.md','UI_STYLE.md','LICENSE')) {
  $sourceFile = Join-Path $SourceDir $file
  if (Test-Path -LiteralPath $sourceFile) { Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $AppDir $file) -Force }
}

$pkgJson = @{
  name = 'fritia-online-next-desktop'
  version = $Version
  description = 'Fritia Online NEXT desktop client'
  main = 'electron-main.js'
  private = $true
  scripts = @{ start = 'electron .'; pack = 'electron-builder --dir' }
  build = @{
    appId = 'com.qingchenwait.fritia-online-next'
    productName = $ProductName
    asar = $true
    files = @('electron-main.js','app/**/*','package.json','build/**/*')
    win = @{ target = @(@{ target = 'dir'; arch = @('x64') }); artifactName = 'Fritia Online NEXT Ver. 0.9.2 Preview Portable.${ext}'; icon = 'build/favicon.ico' }
    directories = @{ output = 'dist_v0.9.2_build' }
    electronDist = './node_modules/electron/dist'
  }
  devDependencies = @{ electron = '^42.4.1'; 'electron-builder' = '^26.15.3'; 'electron-winstaller' = '^5.4.0' }
  dependencies = @{ three = '^0.169.0' }
} | ConvertTo-Json -Depth 10
Write-Utf8NoBom (Join-Path $WorkDir 'package.json') $pkgJson

Push-Location $WorkDir
try {
  npm install
} finally { Pop-Location }

$threeDir = Join-Path $AppDir 'vendor\three'
New-Item -ItemType Directory -Force -Path (Join-Path $threeDir 'build'), (Join-Path $threeDir 'examples\jsm') | Out-Null
Copy-Item -LiteralPath (Join-Path $WorkDir 'node_modules\three\build\three.module.js') -Destination (Join-Path $threeDir 'build\three.module.js') -Force
Copy-Item -LiteralPath (Join-Path $WorkDir 'node_modules\three\examples\jsm\*') -Destination (Join-Path $threeDir 'examples\jsm') -Recurse -Force

$indexPath = Join-Path $AppDir 'index.html'
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$index = [regex]::Replace($index, '(?s)<title>.*?</title>', "<title>$Title</title>")
$importMap = @(
  '<script type="importmap">',
  '    {',
  '        "imports": {',
  '            "three": "./vendor/three/build/three.module.js",',
  '            "three/addons/": "./vendor/three/examples/jsm/"',
  '        }',
  '    }',
  '    </script>'
) -join "`r`n"
$index = [regex]::Replace($index, '(?s)<script type="importmap">.*?</script>', $importMap)
Write-Utf8NoBom $indexPath $index

Copy-Item -LiteralPath (Join-Path $PackageDir 'templates\electron-main.v0.9.2.js') -Destination (Join-Path $WorkDir 'electron-main.js') -Force
Copy-DirectoryContent (Join-Path $PackageDir 'templates\loader-v0.9.2') $LoaderDir

Push-Location $WorkDir
try {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  npx electron-builder --win dir --x64 --config.directories.output=dist_v0.9.2_build
} finally { Pop-Location }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $PayloadZip) { Remove-Item -LiteralPath $PayloadZip -Force }
$src = (Resolve-Path -LiteralPath (Join-Path $BuildOutDir 'win-unpacked')).Path.TrimEnd('\')
$fs = [System.IO.File]::Open($PayloadZip, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
try {
  $archive = [System.IO.Compression.ZipArchive]::new($fs, [System.IO.Compression.ZipArchiveMode]::Create, $false, [System.Text.Encoding]::UTF8)
  try {
    Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {
      $full = $_.FullName
      $rel = $full.Substring($src.Length + 1).Replace('\','/')
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $full, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose() }
} finally { $fs.Dispose() }

Push-Location $LoaderDir
try { cargo build --release } finally { Pop-Location }

$rcedit = Join-Path $WorkDir 'node_modules\electron-winstaller\vendor\rcedit.exe'
if (-not (Test-Path -LiteralPath $rcedit)) {
  $rcedit = Get-ChildItem -LiteralPath (Join-Path $WorkDir 'node_modules') -Filter 'rcedit.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $rcedit) { throw 'rcedit.exe not found under node_modules. Re-run npm install.' }

$tmp = Join-Path $FinalDir ($OutputName -replace '\.exe$', '.tmp.exe')
Copy-Item -LiteralPath (Join-Path $LoaderDir 'target\release\fritia_portable_loader.exe') -Destination $tmp -Force
& $rcedit $tmp --set-icon (Join-Path $BuildDir 'favicon.ico')
if ($LASTEXITCODE -ne 0) { throw "rcedit failed with exit code $LASTEXITCODE" }

$loaderBytes = [System.IO.File]::ReadAllBytes($tmp)
$payloadBytes = [System.IO.File]::ReadAllBytes($PayloadZip)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha.ComputeHash($payloadBytes)
$sha.Dispose()
$footer = New-Object byte[] 64
[Array]::Copy([System.Text.Encoding]::ASCII.GetBytes('FRITIA_PAYLOAD_1'), 0, $footer, 0, 16)
[Array]::Copy([BitConverter]::GetBytes([UInt64]$loaderBytes.Length), 0, $footer, 16, 8)
[Array]::Copy([BitConverter]::GetBytes([UInt64]$payloadBytes.Length), 0, $footer, 24, 8)
[Array]::Copy($hash, 0, $footer, 32, 32)
$out = [System.IO.File]::Open($FinalExe, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
  $out.Write($loaderBytes, 0, $loaderBytes.Length)
  $out.Write($payloadBytes, 0, $payloadBytes.Length)
  $out.Write($footer, 0, $footer.Length)
} finally { $out.Dispose() }
Remove-Item -LiteralPath $tmp -Force

[PSCustomObject]@{
  FinalExe = $FinalExe
  PayloadSha256 = ([BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant())
  FinalSize = (Get-Item -LiteralPath $FinalExe).Length
  SignStatus = (Get-AuthenticodeSignature -LiteralPath $FinalExe).Status
} | Format-List

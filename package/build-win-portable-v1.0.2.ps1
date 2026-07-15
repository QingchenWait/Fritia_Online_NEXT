param(
  [string]$SourceDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$PackageDir = $PSScriptRoot,
  [string]$WorkDir = '',
  [string]$Version = '1.0.2',
  [string]$Title = '',
  [string]$ProductName = '',
  [string]$OutputName = 'Fritia Online NEXT Ver. 1.0.2 Portable.exe',
  [string]$NodeModulesSeed = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($WorkDir)) {
  $WorkDir = Join-Path (Split-Path -Parent $SourceDir) 'fritia_online_next_desktop\v1.0.2\win_x64'
}
if ([string]::IsNullOrWhiteSpace($NodeModulesSeed)) {
  $NodeModulesSeed = Join-Path (Split-Path -Parent $SourceDir) 'fritia_online_next_desktop\v1.0.1\win_x64\node_modules'
}
if ([string]::IsNullOrWhiteSpace($Title)) {
  $Title = [System.Text.Encoding]::UTF8.GetString([byte[]]@(232,138,153,230,143,144,233,155,133,32,79,78,76,73,78,69,32,78,69,88,84,32,86,101,114,46,32,49,46,48,46,50,32,124,32,233,157,146,229,176,152,229,183,165,228,189,156,229,174,164))
}
if ([string]::IsNullOrWhiteSpace($ProductName)) {
  $ProductName = [System.Text.Encoding]::UTF8.GetString([byte[]]@(232,138,153,230,143,144,233,155,133,32,79,78,76,73,78,69,32,78,69,88,84))
}

$BuildName = "dist_v$Version" + "_build"
$DistName = "dist_v$Version"
$BuildDir = Join-Path $WorkDir 'build'
$AppDir = Join-Path $WorkDir 'app'
$BuildOutDir = Join-Path $WorkDir $BuildName
$FinalDir = Join-Path $WorkDir $DistName
$LoaderDir = Join-Path $WorkDir "loader\v$Version"
$PayloadZip = Join-Path $BuildOutDir "payload-v$Version.zip"
$FinalExe = Join-Path $FinalDir $OutputName

function Assert-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command '$Name'. $InstallHint"
  }
}

function Resolve-FullPath($Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  return $full.TrimEnd('\')
}

function Assert-Inside($Path, $Root) {
  $full = Resolve-FullPath $Path
  $rootFull = Resolve-FullPath $Root
  if ($full -ne $rootFull -and -not $full.StartsWith($rootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside workspace: $full"
  }
}

function Remove-Tree($Path) {
  if (Test-Path -LiteralPath $Path) {
    Assert-Inside $Path $WorkDir
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
}

function Copy-DirectoryContent($From, $To) {
  if (-not (Test-Path -LiteralPath $From)) {
    throw "Missing directory: $From"
  }
  Remove-Tree $To
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  Get-ChildItem -LiteralPath $From -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $To $_.Name) -Recurse -Force
  }
}

function Copy-DirectoryMirror($From, $To) {
  if (-not (Test-Path -LiteralPath $From)) {
    throw "Missing directory: $From"
  }
  Assert-Inside $To $WorkDir
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  if (Get-Command robocopy -ErrorAction SilentlyContinue) {
    & robocopy $From $To /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
      throw "robocopy failed with exit code $LASTEXITCODE"
    }
  } else {
    Copy-DirectoryContent $From $To
  }
}

function Write-Utf8NoBom($Path, $Text) {
  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function ConvertTo-JsString($Text) {
  return ($Text | ConvertTo-Json -Compress)
}

function ConvertTo-RustString($Text) {
  return '"' + $Text.Replace('\', '\\').Replace('"', '\"') + '"'
}

function Ensure-NodeModules() {
  $nodeModules = Join-Path $WorkDir 'node_modules'
  $electronExe = Join-Path $nodeModules 'electron\dist\electron.exe'
  $builderCmd = Join-Path $nodeModules '.bin\electron-builder.cmd'
  $threeModule = Join-Path $nodeModules 'three\build\three.module.js'
  $rcedit = Join-Path $nodeModules 'electron-winstaller\vendor\rcedit.exe'
  if ((Test-Path -LiteralPath $electronExe) -and (Test-Path -LiteralPath $builderCmd) -and (Test-Path -LiteralPath $threeModule) -and (Test-Path -LiteralPath $rcedit)) {
    return
  }
  if (Test-Path -LiteralPath $NodeModulesSeed) {
    Write-Host "Copying local node_modules seed..."
    Copy-DirectoryMirror $NodeModulesSeed $nodeModules
  }
  if ((Test-Path -LiteralPath $electronExe) -and (Test-Path -LiteralPath $builderCmd) -and (Test-Path -LiteralPath $threeModule) -and (Test-Path -LiteralPath $rcedit)) {
    return
  }
  $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
  if (-not $npmCmd) {
    throw "npm.cmd not found. Install Node.js 20 LTS or newer."
  }
  Push-Location $WorkDir
  try {
    & $npmCmd.Source install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Patch-IndexHtml($Path) {
  $index = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $index = [regex]::Replace($index, '(?s)<title>.*?</title>', "<title>$Title</title>", 1)
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
  if ([regex]::IsMatch($index, '(?s)<script type="importmap">.*?</script>')) {
    $index = [regex]::Replace($index, '(?s)<script type="importmap">.*?</script>', $importMap, 1)
  } else {
    $index = [regex]::Replace($index, '(?i)</head>', "$importMap`r`n</head>", 1)
  }
  Write-Utf8NoBom $Path $index
}

function Patch-ElectronMain($Path) {
  $main = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $main = [regex]::Replace($main, "const PRODUCT_NAME = .*?;", "const PRODUCT_NAME = $(ConvertTo-JsString $Title);", 1)
  $main = [regex]::Replace($main, "(?m)^\s*app\.setName\(.*?\);\s*$", '')
  Write-Utf8NoBom $Path $main
}

function Patch-Loader($LoaderRoot) {
  $mainPath = Join-Path $LoaderRoot 'src\main.rs'
  $cargoPath = Join-Path $LoaderRoot 'Cargo.toml'
  $lockPath = Join-Path $LoaderRoot 'Cargo.lock'
  $main = [System.IO.File]::ReadAllText($mainPath, [System.Text.Encoding]::UTF8)
  $main = [regex]::Replace($main, 'const APP_VERSION: &str = ".*?";', "const APP_VERSION: &str = `"$Version`";", 1)
  $main = [regex]::Replace($main, 'const APP_EXE: &str = ".*?";', "const APP_EXE: &str = $(ConvertTo-RustString ($ProductName + '.exe'));", 1)
  $main = [regex]::Replace($main, 'const TITLE: &str = ".*?";', "const TITLE: &str = $(ConvertTo-RustString $Title);", 1)
  $classSuffix = ($Version -replace '[^0-9A-Za-z]', '')
  if ([string]::IsNullOrWhiteSpace($classSuffix)) { $classSuffix = 'portable' }
  $className = 'FritiaOnlineNextPortableLoader' + $classSuffix
  $main = [regex]::Replace($main, 'wide_nul\("FritiaOnlineNext(?:Embedded|Portable)Loader.*?"\)', 'wide_nul("' + $className + '")', 1)
  Write-Utf8NoBom $mainPath $main

  $cargo = [System.IO.File]::ReadAllText($cargoPath, [System.Text.Encoding]::UTF8)
  $packageVersionRegex = [regex]::new('(?m)^version = ".*?"')
  $cargo = $packageVersionRegex.Replace($cargo, "version = `"$Version`"", 1)
  Write-Utf8NoBom $cargoPath $cargo

  if (Test-Path -LiteralPath $lockPath) {
    $lock = [System.IO.File]::ReadAllText($lockPath, [System.Text.Encoding]::UTF8)
    $loaderLockRegex = [regex]::new('(?ms)(\[\[package\]\]\s+name = "fritia_portable_loader"\s+version = )".*?"')
    $lock = $loaderLockRegex.Replace($lock, "`${1}`"$Version`"", 1)
    Write-Utf8NoBom $lockPath $lock
  }
}

function Zip-WinUnpacked() {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $PayloadZip) {
    Assert-Inside $PayloadZip $WorkDir
    Remove-Item -LiteralPath $PayloadZip -Force
  }
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
    } finally {
      $archive.Dispose()
    }
  } finally {
    $fs.Dispose()
  }
}

function Join-LoaderAndPayload($RceditPath) {
  $tmp = Join-Path $FinalDir ($OutputName -replace '\.exe$', '.tmp.exe')
  if (Test-Path -LiteralPath $tmp) {
    Assert-Inside $tmp $WorkDir
    Remove-Item -LiteralPath $tmp -Force
  }
  Copy-Item -LiteralPath (Join-Path $LoaderDir 'target\release\fritia_portable_loader.exe') -Destination $tmp -Force
  & $RceditPath $tmp --set-icon (Join-Path $BuildDir 'favicon.ico')
  if ($LASTEXITCODE -ne 0) {
    throw "rcedit failed with exit code $LASTEXITCODE"
  }

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
  } finally {
    $out.Dispose()
  }
  Remove-Item -LiteralPath $tmp -Force
  return ([BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant())
}

Assert-Command node 'Install Node.js 20 LTS or newer.'
Assert-Command cargo 'Install Rust stable x86_64-pc-windows-msvc with Visual Studio Build Tools.'

$SourceDir = Resolve-FullPath $SourceDir
$PackageDir = Resolve-FullPath $PackageDir
$WorkDir = Resolve-FullPath $WorkDir
New-Item -ItemType Directory -Force -Path $WorkDir, $BuildDir, $FinalDir | Out-Null

Copy-Item -LiteralPath (Join-Path $PackageDir 'favicon.ico') -Destination (Join-Path $BuildDir 'favicon.ico') -Force
Copy-Item -LiteralPath (Join-Path $PackageDir 'favicon_runtime.ico') -Destination (Join-Path $BuildDir 'favicon_runtime.ico') -Force
Copy-Item -LiteralPath (Join-Path $PackageDir 'portableSplash_1280x720.bmp') -Destination (Join-Path $BuildDir 'portableSplash_1280x720.bmp') -Force

foreach ($name in @('css','js','src','ui')) {
  Copy-DirectoryContent (Join-Path $SourceDir $name) (Join-Path $AppDir $name)
}
foreach ($file in @('index.html','README.md','UI_STYLE.md','LICENSE')) {
  $sourceFile = Join-Path $SourceDir $file
  if (Test-Path -LiteralPath $sourceFile) {
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $AppDir $file) -Force
  }
}
Copy-Item -LiteralPath (Join-Path $PackageDir 'favicon.ico') -Destination (Join-Path $AppDir 'favicon.ico') -Force

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
    win = @{ target = @(@{ target = 'dir'; arch = @('x64') }); artifactName = "Fritia Online NEXT Ver. $Version Portable.`${ext}"; icon = 'build/favicon.ico' }
    directories = @{ output = $BuildName }
    electronDist = './node_modules/electron/dist'
  }
  devDependencies = @{ electron = '^42.4.1'; 'electron-builder' = '^26.15.3'; 'electron-winstaller' = '^5.4.0' }
  dependencies = @{ three = '^0.169.0' }
} | ConvertTo-Json -Depth 10
Write-Utf8NoBom (Join-Path $WorkDir 'package.json') $pkgJson

Ensure-NodeModules

$threeDir = Join-Path $AppDir 'vendor\three'
New-Item -ItemType Directory -Force -Path (Join-Path $threeDir 'build'), (Join-Path $threeDir 'examples\jsm') | Out-Null
Copy-Item -LiteralPath (Join-Path $WorkDir 'node_modules\three\build\three.module.js') -Destination (Join-Path $threeDir 'build\three.module.js') -Force
Copy-Item -Path (Join-Path $WorkDir 'node_modules\three\examples\jsm\*') -Destination (Join-Path $threeDir 'examples\jsm') -Recurse -Force

Patch-IndexHtml (Join-Path $AppDir 'index.html')

Copy-Item -LiteralPath (Join-Path $PackageDir 'templates\electron-main.v0.9.2.js') -Destination (Join-Path $WorkDir 'electron-main.js') -Force
Patch-ElectronMain (Join-Path $WorkDir 'electron-main.js')

Copy-DirectoryContent (Join-Path $PackageDir 'templates\loader-v0.9.2') $LoaderDir
Patch-Loader $LoaderDir

Push-Location $WorkDir
try {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  $builderCmd = Join-Path $WorkDir 'node_modules\.bin\electron-builder.cmd'
  & $builderCmd --win dir --x64 "--config.directories.output=$BuildName"
  if ($LASTEXITCODE -ne 0) {
    throw "electron-builder failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Zip-WinUnpacked

Push-Location $LoaderDir
try {
  cargo build --release --locked
  if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$rcedit = Join-Path $WorkDir 'node_modules\electron-winstaller\vendor\rcedit.exe'
if (-not (Test-Path -LiteralPath $rcedit)) {
  $rcedit = Get-ChildItem -LiteralPath (Join-Path $WorkDir 'node_modules') -Filter 'rcedit.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $rcedit) {
  throw 'rcedit.exe not found under node_modules.'
}

$payloadHash = Join-LoaderAndPayload $rcedit

[PSCustomObject]@{
  FinalExe = $FinalExe
  PayloadSha256 = $payloadHash
  FinalSize = (Get-Item -LiteralPath $FinalExe).Length
  SignStatus = (Get-AuthenticodeSignature -LiteralPath $FinalExe).Status
  Title = $Title
  Cache = Join-Path $env:LOCALAPPDATA "FritiaOnlineNextPortable\$Version\app"
} | Format-List

param(
  [string]$SourceDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$WorkDir = '',
  [string]$Version = '1.0.2',
  [string]$Title = '',
  [string]$ProductName = '',
  [string]$OutputName = 'Fritia Online NEXT Ver. 1.0.2 Portable.exe',
  [string]$NodeModulesSeed = ''
)

$script = Join-Path $PSScriptRoot 'build-win-portable-v1.0.2.ps1'
$params = @{
  SourceDir = $SourceDir
  WorkDir = $WorkDir
  Version = $Version
  Title = $Title
  ProductName = $ProductName
  OutputName = $OutputName
  NodeModulesSeed = $NodeModulesSeed
}
& $script @params
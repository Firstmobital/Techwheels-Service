# Techwheels mobile — run from mobile folder:  .\dev.ps1
$mingit = 'C:\Users\gedar\apps\MinGit\cmd'
if (Test-Path $mingit) {
  $env:Path = "$mingit;$env:Path"
}

Set-Location $PSScriptRoot

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing dependencies...'
  npm install
}

Write-Host 'Starting Expo (Ctrl+C to stop)...'
npx expo start

# Launch pnpm dev with MSVC + Windows SDK paths (required on Windows when
# VsDevCmd does not add um\x64 to LIB).
$ErrorActionPreference = "Stop"

$buildTools = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools"
$msvcBin = (Resolve-Path "$buildTools\VC\Tools\MSVC\*\bin\Hostx64\x64").Path
$msvcLib = (Resolve-Path "$buildTools\VC\Tools\MSVC\*\lib\x64").Path
$sdkLib = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\Lib" -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1 -ExpandProperty FullName

$env:LIB = "$msvcLib;$sdkLib\um\x64;$sdkLib\ucrt\x64"
$env:Path = "$msvcBin;$env:USERPROFILE\.cargo\bin;$env:Path"

Set-Location (Join-Path $PSScriptRoot "..")
pnpm dev

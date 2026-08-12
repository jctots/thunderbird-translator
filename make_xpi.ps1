$src = $PSScriptRoot
$manifest = Get-Content (Join-Path $src 'manifest.json') | ConvertFrom-Json
$version = $manifest.version
$xpiPath = Join-Path $src "thunderbird-translator-v$version.xpi"

# Remove old XPI if exists
if (Test-Path $xpiPath) {
    Remove-Item $xpiPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($xpiPath, 'Create')

# Files to include
$includes = @(
    'manifest.json',
    'background.js',
    'content\translator.js',
    'content\composer.js',
    'options\options.html',
    'options\options.js',
    'icons\translate-dark.svg',
    'icons\translate-light.svg'
)

foreach ($rel in $includes) {
    $full = Join-Path $src $rel
    if (Test-Path $full) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $rel.Replace('\','/'), [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        Write-Host "Added: $rel"
    } else {
        Write-Host "MISSING: $rel"
    }
}

# _docs/ holds README and ATN listing screenshots only. It is deliberately NOT
# packaged: shipping it bloats the XPI and was rejected in ATN review of 1.8.3.

# Add all _locales files
Get-ChildItem -Path (Join-Path $src '_locales') -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    Write-Host "Added: $rel"
}

$zip.Dispose()
$size = (Get-Item $xpiPath).Length
Write-Host "XPI created: thunderbird-translator-v$version.xpi ($size bytes)"

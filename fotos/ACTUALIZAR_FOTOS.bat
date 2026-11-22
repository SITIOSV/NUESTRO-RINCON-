@echo off
chcp 65001 >nul
title Actualizar fotos - Nuestro Rincon
set "DIRB=%~dp0"
set "BATF=%~f0"
echo.
echo  Renombrando las fotos de esta carpeta (foto1, foto2, foto3...)
echo  Las que ya se llaman fotoN no se tocan; las nuevas siguen la numeracion.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:BATF); $i=$s.LastIndexOf('#'+'PS#'); Invoke-Expression $s.Substring($i+4)"
echo.
pause
exit /b
#PS#
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $env:DIRB
$pat = '^foto\d+\.(jpg|png|webp)$'
$exts = '.jpg', '.jpeg', '.png', '.webp'
$todos = @(Get-ChildItem -LiteralPath . -File | Where-Object { $exts -contains $_.Extension.ToLower() })
$max = 0
foreach ($f in $todos) { if ($f.Name -cmatch $pat) { $n = [int]($f.BaseName -replace '^foto', ''); if ($n -gt $max) { $max = $n } } }
$nuevas = @($todos | Where-Object { $_.Name -cnotmatch $pat } | Sort-Object LastWriteTime, Name)
$tmp = @(); $i = 0
foreach ($f in $nuevas) {
  $i++
  $t = '__tmp_' + $i + '_' + [guid]::NewGuid().ToString('N').Substring(0, 6) + $f.Extension.ToLower()
  Rename-Item -LiteralPath $f.FullName -NewName $t
  $tmp += $t
}
$n = $max
foreach ($t in $tmp) {
  $n++
  $e = [IO.Path]::GetExtension($t)
  if ($e -eq '.jpeg') { $e = '.jpg' }
  Rename-Item -LiteralPath (Join-Path $PWD.Path $t) -NewName ('foto' + $n + $e)
}
$lista = @(Get-ChildItem -LiteralPath . -File | Where-Object { $_.Name -cmatch $pat } | Sort-Object { [int]($_.BaseName -replace '^foto', '') } | ForEach-Object { $_.Name })
$json = '[' + (($lista | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
[IO.File]::WriteAllText((Join-Path $PWD.Path 'lista.json'), $json, (New-Object Text.UTF8Encoding($false)))
Write-Host ''
Write-Host ('Fotos renombradas ahora: ' + $nuevas.Count)
Write-Host ('Fotos en total en la lista: ' + $lista.Count)
$grandes = @(Get-ChildItem -LiteralPath . -File | Where-Object { $_.Name -cmatch $pat -and $_.Length -gt 2MB })
if ($grandes.Count -gt 0) { Write-Host ''; Write-Host 'Aviso: estas fotos pesan mas de 2 MB (conviene comprimirlas a ~1600 px):' -ForegroundColor Yellow; $grandes | ForEach-Object { Write-Host ('  ' + $_.Name) } }
Write-Host ''
Write-Host 'Listo. Ahora sube la carpeta fotos a GitHub (incluye lista.json).' -ForegroundColor Green

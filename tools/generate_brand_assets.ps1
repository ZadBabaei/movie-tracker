$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $repoRoot "client\src\assets"
$publicDir = Join-Path $repoRoot "client\public"
$sourceImage = "C:\Users\mehrz\OneDrive\Desktop\Gemini_Generated_Image_157h62157h62157h.png"

New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

if (-not (Test-Path $sourceImage)) {
  throw "Reference image not found at $sourceImage"
}

$image = [System.Drawing.Bitmap]::FromFile($sourceImage)

function Save-Crop {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string]$OutputPath,
    [int]$ResizeWidth = 0,
    [int]$ResizeHeight = 0
  )

  $rect = New-Object System.Drawing.Rectangle($X, $Y, $Width, $Height)
  $cropped = $Bitmap.Clone($rect, $Bitmap.PixelFormat)

  if ($ResizeWidth -gt 0 -and $ResizeHeight -gt 0) {
    $resized = New-Object System.Drawing.Bitmap($ResizeWidth, $ResizeHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($resized)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($cropped, 0, 0, $ResizeWidth, $ResizeHeight)
    $graphics.Dispose()
    $cropped.Dispose()
    $cropped = $resized
  }

  $cropped.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $cropped.Dispose()
}

function Get-CropBitmap {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )

  $rect = New-Object System.Drawing.Rectangle($X, $Y, $Width, $Height)
  return $Bitmap.Clone($rect, $Bitmap.PixelFormat)
}

function Save-Bitmap {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$OutputPath
  )

  $Bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}

# Brand assets for the app UI.
$standaloneIcon = Get-CropBitmap -Bitmap $image -X 1470 -Y 18 -Width 440 -Height 150
$wordmark = Get-CropBitmap -Bitmap $image -X 1094 -Y 420 -Width 458 -Height 62

Save-Bitmap -Bitmap $standaloneIcon -OutputPath (Join-Path $assetsDir "movie-tracker-standalone-icon.png")
Save-Bitmap -Bitmap $wordmark -OutputPath (Join-Path $assetsDir "movie-tracker-wordmark.png")

$logoCanvas = New-Object System.Drawing.Bitmap(980, 180)
$graphics = [System.Drawing.Graphics]::FromImage($logoCanvas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.Clear([System.Drawing.Color]::FromArgb(13, 13, 18))
$graphics.DrawImage($standaloneIcon, 24, 16, 420, 143)
$graphics.DrawImage($wordmark, 434, 60, 500, 68)
$graphics.Dispose()
Save-Bitmap -Bitmap $logoCanvas -OutputPath (Join-Path $assetsDir "movie-tracker-logo-full.png")
$logoCanvas.Dispose()
$standaloneIcon.Dispose()
$wordmark.Dispose()

# PWA and favicon crops derived from the app icon panel.
Save-Crop -Bitmap $image -X 58 -Y 62 -Width 270 -Height 270 -OutputPath (Join-Path $publicDir "movie-tracker-icon-512.png") -ResizeWidth 512 -ResizeHeight 512
Save-Crop -Bitmap $image -X 58 -Y 62 -Width 270 -Height 270 -OutputPath (Join-Path $publicDir "movie-tracker-icon-192.png") -ResizeWidth 192 -ResizeHeight 192
Save-Crop -Bitmap $image -X 425 -Y 372 -Width 84 -Height 84 -OutputPath (Join-Path $publicDir "movie-tracker-icon-64.png") -ResizeWidth 64 -ResizeHeight 64
Save-Crop -Bitmap $image -X 425 -Y 372 -Width 84 -Height 84 -OutputPath (Join-Path $publicDir "movie-tracker-icon-32.png") -ResizeWidth 32 -ResizeHeight 32
Save-Crop -Bitmap $image -X 425 -Y 372 -Width 84 -Height 84 -OutputPath (Join-Path $publicDir "movie-tracker-icon-16.png") -ResizeWidth 16 -ResizeHeight 16

$image.Dispose()

Write-Output "Generated branding assets:"
Write-Output (Join-Path $assetsDir "movie-tracker-logo-full.png")
Write-Output (Join-Path $assetsDir "movie-tracker-wordmark.png")
Write-Output (Join-Path $assetsDir "movie-tracker-standalone-icon.png")
Write-Output (Join-Path $publicDir "movie-tracker-icon-512.png")
Write-Output (Join-Path $publicDir "movie-tracker-icon-192.png")
Write-Output (Join-Path $publicDir "movie-tracker-icon-64.png")

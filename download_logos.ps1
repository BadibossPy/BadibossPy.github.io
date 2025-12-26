# PowerShell script to download company logos
# Run this script in the logos directory

$logos = @{
    "anbt-logo.png" = "https://www.anbt.dz/wp-content/themes/anbt/img/logo.png"
    "engie-logo.png" = "https://www.engie.com/themes/custom/engie/logo.svg"
    "cnr-logo.png" = "https://www.cnr.tm.fr/wp-content/uploads/2020/05/logo-cnr.png"
    "reor20-logo.png" = "https://www.reor20.com/wp-content/themes/reor20/images/logo.png"
    "cnrs-logo.png" = "https://www.cnrs.fr/themes/custom/cnrs/logo.svg"
    "inrae-logo.png" = "https://www.inrae.fr/themes/custom/inrae/logo.svg"
    "swa-logo.png" = "https://www.swa.gov.sa/themes/responsive/images/logo.png"
    "miyahthon-logo.png" = "https://www.waterinnovationplatform.com/wp-content/uploads/2023/01/logo.png"
    "idws-logo.png" = "https://idwsc.com/wp-content/uploads/2023/01/idws-logo.png"
}

foreach ($logo in $logos.GetEnumerator()) {
    $outputPath = Join-Path $PSScriptRoot $logo.Key
    Write-Host "Downloading $($logo.Key) from $($logo.Value)"

    try {
        Invoke-WebRequest -Uri $logo.Value -OutFile $outputPath -ErrorAction Stop
        Write-Host "✓ Successfully downloaded $($logo.Key)" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Failed to download $($logo.Key): $($_.Exception.Message)" -ForegroundColor Red

        # Create a fallback text-based logo
        $fallbackPath = [System.IO.Path]::ChangeExtension($outputPath, ".svg")
        $companyName = [System.IO.Path]::GetFileNameWithoutExtension($logo.Key).Replace("-logo", "").ToUpper()

        $svgContent = @"
<svg width="150" height="80" xmlns="http://www.w3.org/2000/svg">
  <rect width="150" height="80" fill="#2c3e50" rx="8"/>
  <text x="75" y="45" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">$companyName</text>
</svg>
"@

        $svgContent | Out-File -FilePath $fallbackPath -Encoding UTF8
        Write-Host "✓ Created fallback SVG logo for $($logo.Key)" -ForegroundColor Yellow
    }
}

Write-Host "`nLogo download complete! Check the logos folder for the images." -ForegroundColor Green
Write-Host "Note: You may need to manually download some logos from company websites if the automated download fails." -ForegroundColor Yellow





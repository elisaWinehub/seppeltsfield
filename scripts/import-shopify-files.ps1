param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,
  [Parameter(Mandatory = $true)]
  [string]$StoreDomain,
  [int]$BatchSize = 25
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Get-FileContentType {
  param([string]$Url)
  $cleanUrl = ($Url -split '\?')[0]
  $ext = [System.IO.Path]::GetExtension($cleanUrl).ToLowerInvariant()

  switch ($ext) {
    ".jpg" { return "IMAGE" }
    ".jpeg" { return "IMAGE" }
    ".png" { return "IMAGE" }
    ".gif" { return "IMAGE" }
    ".webp" { return "IMAGE" }
    ".svg" { return "IMAGE" }
    ".avif" { return "IMAGE" }
    ".bmp" { return "IMAGE" }
    ".tif" { return "IMAGE" }
    ".tiff" { return "IMAGE" }
    ".mp4" { return "VIDEO" }
    ".mov" { return "VIDEO" }
    ".m4v" { return "VIDEO" }
    ".webm" { return "VIDEO" }
    default { return "FILE" }
  }
}

if (!(Test-Path $CsvPath)) {
  throw "CSV not found: $CsvPath"
}

$rows = Import-Csv $CsvPath
if (!$rows -or $rows.Count -eq 0) {
  throw "CSV is empty: $CsvPath"
}

# Deduplicate by URL to avoid duplicate uploads.
$uniqueRows = $rows | Group-Object URL | ForEach-Object { $_.Group[0] }
$total = $uniqueRows.Count

$files = foreach ($row in $uniqueRows) {
  $url = $row.URL
  if ([string]::IsNullOrWhiteSpace($url)) { continue }

  [ordered]@{
    originalSource = $url
    alt            = $row.Title
    contentType    = (Get-FileContentType -Url $url)
  }
}

$mutation = @"
mutation fileCreateBatch(`$files:[FileCreateInput!]!) {
  fileCreate(files: `$files) {
    files { id fileStatus }
    userErrors { field message code }
  }
}
"@

$workDir = Join-Path (Get-Location) ".tmp-file-import"
if (!(Test-Path $workDir)) {
  New-Item -ItemType Directory -Path $workDir | Out-Null
}

$queryFile = Join-Path $workDir "file-create.graphql"
[System.IO.File]::WriteAllText($queryFile, $mutation, $utf8NoBom)

$success = 0
$failed = 0
$batchCount = [Math]::Ceiling($files.Count / $BatchSize)

for ($i = 0; $i -lt $files.Count; $i += $BatchSize) {
  $batchIndex = [int]($i / $BatchSize) + 1
  $batch = @($files[$i..([Math]::Min($i + $BatchSize - 1, $files.Count - 1))])
  $variableFile = Join-Path $workDir ("vars-{0}.json" -f $batchIndex)
  $payload = @{ files = $batch } | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($variableFile, $payload, $utf8NoBom)

  Write-Host ("[{0}/{1}] Uploading batch with {2} files..." -f $batchIndex, $batchCount, $batch.Count)

  $attempt = 0
  $maxAttempts = 3
  $completed = $false

  while (-not $completed -and $attempt -lt $maxAttempts) {
    $attempt++
    try {
      $resultRaw = shopify store execute `
        --store $StoreDomain `
        --query-file $queryFile `
        --variable-file $variableFile `
        --allow-mutations `
        --json

      $result = $resultRaw | ConvertFrom-Json
      if ($result.errors) {
        throw ("GraphQL errors: " + ($result.errors | ConvertTo-Json -Compress))
      }

      $userErrors = $result.data.fileCreate.userErrors
      if ($userErrors -and $userErrors.Count -gt 0) {
        $failed += $batch.Count
        Write-Warning ("Batch {0} userErrors: {1}" -f $batchIndex, ($userErrors | ConvertTo-Json -Compress))
      }
      else {
        $success += $batch.Count
      }
      $completed = $true
    }
    catch {
      if ($attempt -ge $maxAttempts) {
        $failed += $batch.Count
        Write-Warning ("Batch {0} failed after {1} attempts: {2}" -f $batchIndex, $attempt, $_.Exception.Message)
        break
      }
      Start-Sleep -Seconds (2 * $attempt)
    }
  }

  Start-Sleep -Milliseconds 300
}

Write-Host ("Done. Total unique URLs: {0}; Uploaded: {1}; Failed: {2}" -f $total, $success, $failed)

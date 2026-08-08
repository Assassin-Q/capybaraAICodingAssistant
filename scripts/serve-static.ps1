# Temporary static file server for previewing test pages in the built-in browser.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\serve-static.ps1 <root-dir> <port>
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [int]$Port = 8899
)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Output "Serving $Root on http://127.0.0.1:$Port/"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }

    # Prevent path traversal.
    $file = Join-Path $Root ($path -replace '[\\/]', [System.IO.Path]::DirectorySeparatorChar)
    if (-not $file.StartsWith([System.IO.Path]::GetFullPath($Root))) {
        $ctx.Response.StatusCode = 403
        $ctx.Response.Close()
        continue
    }

    if (Test-Path -LiteralPath $file -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $mime = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.json' { 'application/json; charset=utf-8' }
            '.png'  { 'image/png' }
            '.svg'  { 'image/svg+xml' }
            '.jpg'  { 'image/jpeg' }
            '.ico'  { 'image/x-icon' }
            default { 'application/octet-stream' }
        }
        $ctx.Response.ContentType = $mime
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.OutputStream.Close()
    } else {
        $ctx.Response.StatusCode = 404
        $ctx.Response.Close()
    }
}
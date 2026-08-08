# Quick listener smoke test - starts a listener on port 8902 and serves a fixed response.
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8902/")
$listener.Start()
Write-Output "LISTENER_STARTED"

# Serve the first request then stop
try {
    $ctx = $listener.GetContext()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("smoke-test-ok")
    $ctx.Response.ContentType = "text/plain; charset=utf-8"
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
} catch {
    Write-Output ("HANDLE_ERR: " + $_.Exception.Message)
}
$listener.Stop()
$listener.Close()
Write-Output "LISTENER_STOPPED"
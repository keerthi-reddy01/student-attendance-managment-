param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Lines = 40
)

if (-not (Test-Path $Path)) {
    throw "Log file not found: $Path"
}
Get-Content $Path -Tail $Lines

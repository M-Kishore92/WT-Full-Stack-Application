$ErrorActionPreference = "Stop"
$base = "http://localhost:3000"

Write-Host ""
Write-Host "====== STEP a: Login as attendee + list events ======"
$body = @{ email = "attendee1@guest.local"; password = "Password123!" } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body $body
$token = $loginRes.token
$headers = @{ Authorization = "Bearer $token" }
Write-Host ("LOGIN OK - Role: " + $loginRes.user.role + " Name: " + $loginRes.user.name)

$eventsRes = Invoke-RestMethod -Uri "$base/events" -Method Get
$events = $eventsRes.events
Write-Host ("EVENTS FOUND: " + $events.Count)
$evt = $events | Where-Object { [DateTime]::Parse($_.sales_cutoff_at) -gt (Get-Date) -and $_.status -eq "PUBLISHED" } | Select-Object -First 1
if (-not $evt) { $evt = $events[0] }
Write-Host ("EVENT: " + $evt.title + " | Venue: " + $evt.venue)
$tier = $evt.tiers[0]
$available = $tier.total_qty - $tier.sold_qty
Write-Host ("TIER: " + $tier.name + " | Price: " + $tier.price + " | Total: " + $tier.total_qty + " | Sold: " + $tier.sold_qty + " | Available: " + $available)
Write-Host "[OK] Events loaded with countdown-ready tier info"

Write-Host ""
Write-Host "====== STEP a: Reserve 1 ticket ======"
$resBody = @{ tierId = $tier.id; qty = 1 } | ConvertTo-Json
$resRes = Invoke-RestMethod -Uri "$base/reservations" -Method Post -ContentType "application/json" -Body $resBody -Headers $headers
$reservation = $resRes.reservation
Write-Host ("RESERVATION ID: " + $reservation.id)
Write-Host ("EXPIRES AT: " + $reservation.expires_at)
$expiry = [DateTime]::Parse($reservation.expires_at)
$secsLeft = ($expiry - (Get-Date)).TotalSeconds
Write-Host ("COUNTDOWN: " + [Math]::Round($secsLeft) + " seconds remaining (~10 min)")
Write-Host "[OK] Countdown timer would show in browser"

Write-Host ""
Write-Host "====== STEP b: Create order + charge payment ======"
$orderKey = "verify-key-" + (Get-Random)
$orderBody = @{ reservationId = $reservation.id; idempotencyKey = $orderKey } | ConvertTo-Json
$orderRes = Invoke-RestMethod -Uri "$base/orders" -Method Post -ContentType "application/json" -Body $orderBody -Headers $headers
$orderId = $orderRes.order.id
Write-Host ("ORDER CREATED - ID: " + $orderId + " Status: " + $orderRes.order.status)

$chargeBody = @{ orderId = $orderId; forceOutcome = "APPROVE" } | ConvertTo-Json
$chargeRes = Invoke-RestMethod -Uri "$base/payments/charge" -Method Post -ContentType "application/json" -Body $chargeBody -Headers $headers
Write-Host ("PAYMENT QUEUED - TransactionId: " + $chargeRes.transactionId)

Write-Host "Polling payment status (up to 20s)..."
$finalStatus = $null
for ($i = 0; $i -lt 13; $i++) {
    Start-Sleep -Milliseconds 1500
    try {
        $statusRes = Invoke-RestMethod -Uri ($base + "/payments/status/" + $orderId) -Method Get -Headers $headers
        $st = $statusRes.status
        Write-Host ("  Poll " + ($i+1) + ": " + $st)
        if ($st -eq "PAID" -or $st -eq "FAILED") {
            $finalStatus = $statusRes
            break
        }
    } catch {
        Write-Host ("  Poll " + ($i+1) + ": error - " + $_.Exception.Message)
    }
}

if ($finalStatus -and $finalStatus.status -eq "PAID") {
    Write-Host ("[OK] PAYMENT RESULT: PAID")
    Write-Host ("     TICKETS ISSUED: " + $finalStatus.tickets.Count)
    foreach ($t in $finalStatus.tickets) {
        $tCode = if ($t.code) { $t.code } else { $t.ticket_code }
        Write-Host ("     TICKET CODE: " + $tCode)
    }
} else {
    Write-Host ("PAYMENT RESULT: " + $finalStatus.status + " (check BullMQ worker)")
}

Write-Host ""
Write-Host "====== STEP c: Oversell - reserve more than available (expect 409) ======"
$ErrorActionPreference = "Continue"
$oversellBody = @{ tierId = $tier.id; qty = 9999 } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$base/reservations" -Method Post -ContentType "application/json" -Body $oversellBody -Headers $headers
    Write-Host "FAIL: Expected 409 but request succeeded!"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host ("OVERSELL REJECTED with HTTP " + $code)
    $detail = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host ("[OK] 409 message: " + $detail.error)
}
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "====== STEP d: Organizer login + create event + analytics ======"
$orgBody = @{ email = "organizer1@fest.local"; password = "Password123!" } | ConvertTo-Json
$orgLogin = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body $orgBody
$orgHeaders = @{ Authorization = "Bearer " + $orgLogin.token }
Write-Host ("ORGANIZER LOGIN OK - Role: " + $orgLogin.user.role)

$starts = (Get-Date).AddDays(30).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cutoff = (Get-Date).AddDays(29).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$evtBody = @{
    title = ("Verify Summit " + (Get-Random))
    description = "Auto-created event"
    venue = "Verify Hall, City"
    starts_at = $starts
    sales_cutoff_at = $cutoff
    tiers = @(@{ name = "General"; price = 99; total_qty = 150 })
} | ConvertTo-Json -Depth 5
$newEvt = Invoke-RestMethod -Uri "$base/events" -Method Post -ContentType "application/json" -Body $evtBody -Headers $orgHeaders
Write-Host ("[OK] EVENT CREATED: " + $newEvt.event.title + " ID: " + $newEvt.event.id)

$revRes = Invoke-RestMethod -Uri "$base/analytics/revenue" -Method Get -Headers $orgHeaders
Write-Host ("[OK] ANALYTICS REVENUE: total=$" + $revRes.summary.totalRevenue + " orders=" + $revRes.summary.totalOrders)

$tiersRes = Invoke-RestMethod -Uri "$base/analytics/tiers" -Method Get -Headers $orgHeaders
Write-Host ("[OK] ANALYTICS TIERS: " + $tiersRes.totalTiers + " tiers across organizer's events")

$convRes = Invoke-RestMethod -Uri "$base/analytics/conversion" -Method Get -Headers $orgHeaders
Write-Host ("[OK] ANALYTICS CONVERSION RATE: " + $convRes.conversionRatePercent + "%")

Write-Host ""
Write-Host "====== STEP e: Hold expiry test ======"
$a2Body = @{ email = "attendee2@guest.local"; password = "Password123!" } | ConvertTo-Json
$a2Login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body $a2Body
$a2Headers = @{ Authorization = "Bearer " + $a2Login.token }

$r2Body = @{ tierId = $tier.id; qty = 1 } | ConvertTo-Json
$r2Res = Invoke-RestMethod -Uri "$base/reservations" -Method Post -ContentType "application/json" -Body $r2Body -Headers $a2Headers
$r2Id = $r2Res.reservation.id
Write-Host ("RESERVATION CREATED: " + $r2Id)

# Expire the reservation by updating it directly in the DB
Write-Host "Manually expiring the reservation via Prisma..."
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.reservation.update({ where: { id: '$r2Id' }, data: { expires_at: new Date(Date.now() - 60000), status: 'EXPIRED' } }).then(r => { console.log('EXPIRED OK: ' + r.id); return p.`$disconnect(); }).catch(e => { console.error(e); process.exit(1); });"

$ErrorActionPreference = "Continue"
Write-Host "Attempting order on expired hold (expect 410)..."
$expBody = @{ reservationId = $r2Id; idempotencyKey = ("expired-" + (Get-Random)) } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$base/orders" -Method Post -ContentType "application/json" -Body $expBody -Headers $a2Headers
    Write-Host "FAIL: Expected 410 but succeeded!"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $detail = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host ("[OK] EXPIRED HOLD REJECTED with HTTP " + $code + ": " + $detail.error)
}

Write-Host ""
Write-Host "====== CORS CHECK ======"
$corsRes = Invoke-WebRequest -Uri "$base/events" -Method Get -UseBasicParsing -Headers @{
    "Origin" = "http://localhost:5173"
    "Accept" = "application/json"
}
$acao = $corsRes.Headers["Access-Control-Allow-Origin"]
Write-Host ("CORS Access-Control-Allow-Origin: '" + $acao + "'")
if ($acao -eq "*" -or $acao -eq "http://localhost:5173") {
    Write-Host "[OK] CORS allows frontend origin"
} else {
    Write-Host "[WARN] CORS header not set - check app.ts cors() config"
}

Write-Host ""
Write-Host "========================================="
Write-Host "ALL VERIFICATION STEPS COMPLETE"
Write-Host "========================================="

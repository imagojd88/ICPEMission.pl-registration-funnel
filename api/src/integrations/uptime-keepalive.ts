/**
 * Keep-alive Rendera przez UptimeRobota.
 * Gdy tworzony/otwierany jest event, wznawiamy monitor (status=1), żeby
 * pingował API co kilka minut i backend nie zasypiał w oknie rejestracji.
 * Pauzowanie monitora (gdy brak otwartych eventów) robi Personal OS.
 *
 * Konfiguracja (ENV, opcjonalna — brak = funkcja jest no-op):
 *   UPTIMEROBOT_API_KEY   — klucz API monitora (Main API Key lub monitor-specific)
 *   UPTIMEROBOT_MONITOR_ID — id monitora do wznowienia
 */
export async function resumeUptimeMonitor(): Promise<void> {
  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  const monitorId = process.env.UPTIMEROBOT_MONITOR_ID;
  if (!apiKey || !monitorId) return; // brak konfiguracji → nic nie rób

  try {
    await fetch('https://api.uptimerobot.com/v2/editMonitor', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'cache-control': 'no-cache',
      },
      body: new URLSearchParams({
        api_key: apiKey,
        id: monitorId,
        status: '1', // 1 = wznów (running), 0 = pauza
      }).toString(),
    });
  } catch {
    // best-effort — nie przerywaj tworzenia eventu, jeśli ping się nie uda
  }
}

import { Injectable, Logger } from '@nestjs/common';

/**
 * Wywołuje Render Deploy Hook strony Astro po publikacji/zmianie treści.
 * Debounce: seria publikacji w krótkim czasie = jeden build (po `delayMs` ciszy).
 * URL z ENV `SITE_DEPLOY_HOOK_URL` (gdy brak — tylko log, bez akcji).
 */
@Injectable()
export class DeployHookService {
  private readonly logger = new Logger(DeployHookService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly delayMs = 15000;

  trigger(reason: string) {
    const url = process.env.SITE_DEPLOY_HOOK_URL;
    if (!url) {
      this.logger.log(`[deploy-hook] pominięto (${reason}) — brak SITE_DEPLOY_HOOK_URL`);
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.fire(url, reason);
    }, this.delayMs);
    this.logger.log(`[deploy-hook] zaplanowano rebuild za ${this.delayMs / 1000}s (${reason})`);
  }

  private async fire(url: string, reason: string) {
    this.timer = null;
    try {
      const doFetch = (globalThis as { fetch?: (u: string, o?: unknown) => Promise<{ status: number }> }).fetch;
      if (!doFetch) {
        this.logger.error('[deploy-hook] brak globalnego fetch (Node < 18?)');
        return;
      }
      const res = await doFetch(url, { method: 'POST' });
      this.logger.log(`[deploy-hook] wywołano (${reason}) → HTTP ${res.status}`);
    } catch (e) {
      this.logger.error(`[deploy-hook] błąd wywołania: ${(e as Error).message}`);
    }
  }
}

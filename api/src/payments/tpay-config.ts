/**
 * Konfiguracja płatności online z ENV — czytana z `process.env` (ConfigModule ładuje tam .env),
 * żeby mogły z niej korzystać także serwisy spoza modułu płatności (np. przypomnienia o ratach)
 * bez zależności między modułami. Nic tu nie jest logowane; sekrety nie wychodzą poza `tpayConfig()`.
 */
import type { TpayEnv } from './tpay-verify';

export interface TpayConfig {
  /** PAYMENTS_MODE: `mock` (domyślnie) albo `tpay` */
  mode: 'mock' | 'tpay';
  env: TpayEnv;
  clientId: string;
  clientSecret: string;
  merchantId: string;
  securityCode: string;
  /** publiczny adres API (z prefiksem, jeśli API go używa), bez końcowego ukośnika; '' = brak */
  apiPublicUrl: string;
  /** adres API Tpay dla wybranego środowiska */
  apiBase: string;
  /** adres powiadomień przekazywany Tpay; '' gdy brak API_PUBLIC_URL */
  notificationUrl: string;
  /**
   * TPAY_ALLOW_TEST_MODE=true: na produkcji przyjmujemy powiadomienia z `test_mode=1`
   * („tryb testowy” konta produkcyjnego Tpay). Domyślnie false. Tylko dokładnie `true`.
   */
  allowTestMode: boolean;
  /** nazwy brakujących zmiennych (puste = komplet) */
  missing: string[];
  /** tryb `tpay` i komplet zmiennych */
  ready: boolean;
}

const TPAY_API: Record<TpayEnv, string> = {
  production: 'https://api.tpay.com',
  sandbox: 'https://openapi.sandbox.tpay.com',
};

const val = (env: NodeJS.ProcessEnv, key: string) => String(env[key] ?? '').trim();

export function tpayConfig(env: NodeJS.ProcessEnv = process.env): TpayConfig {
  const mode = val(env, 'PAYMENTS_MODE').toLowerCase() === 'tpay' ? 'tpay' : 'mock';
  // Domyślnie sandbox: literówka w TPAY_ENV nie może przełączyć na produkcję.
  const tpayEnv: TpayEnv = val(env, 'TPAY_ENV').toLowerCase() === 'production' ? 'production' : 'sandbox';
  let apiPublicUrl = val(env, 'API_PUBLIC_URL').replace(/\/+$/, '');
  if (apiPublicUrl && !/^https:\/\//i.test(apiPublicUrl)) apiPublicUrl = '';
  const prefix = val(env, 'API_PREFIX').replace(/^\/+|\/+$/g, '');
  if (apiPublicUrl && prefix && !apiPublicUrl.endsWith(`/${prefix}`)) apiPublicUrl = `${apiPublicUrl}/${prefix}`;
  const cfg = {
    mode: mode as 'mock' | 'tpay',
    env: tpayEnv,
    clientId: val(env, 'TPAY_CLIENT_ID'),
    clientSecret: val(env, 'TPAY_CLIENT_SECRET'),
    merchantId: val(env, 'TPAY_MERCHANT_ID'),
    securityCode: val(env, 'TPAY_SECURITY_CODE'),
    apiPublicUrl,
    apiBase: TPAY_API[tpayEnv],
    allowTestMode: val(env, 'TPAY_ALLOW_TEST_MODE').toLowerCase() === 'true',
    notificationUrl: apiPublicUrl ? `${apiPublicUrl}/payments/webhook/tpay` : '',
  };
  const missing = [
    ['TPAY_CLIENT_ID', cfg.clientId],
    ['TPAY_CLIENT_SECRET', cfg.clientSecret],
    ['TPAY_MERCHANT_ID', cfg.merchantId],
    ['TPAY_SECURITY_CODE', cfg.securityCode],
    ['API_PUBLIC_URL', cfg.apiPublicUrl],
  ].filter(([, v]) => !v).map(([k]) => k);
  return { ...cfg, missing, ready: mode === 'tpay' && missing.length === 0 };
}

/** Dostawcy płatności online gotowi do użycia (lista dla `GET /payments/config`). W trybie `mock` pusta. */
export function configuredOnlineProviders(env: NodeJS.ProcessEnv = process.env): string[] {
  return tpayConfig(env).ready ? ['tpay'] : [];
}

# Wdrożenie na VPS — rejestracja.icpemission.pl

Przewodnik dla serwera **VPS z Ubuntu (22.04/24.04) i dostępem root/SSH**. Topologia: jedna subdomena `rejestracja.icpemission.pl` — frontend (statyczny build) serwowany przez Nginx z `/`, backend (NestJS) pod `/api`, PostgreSQL lokalnie, proces utrzymywany przez PM2, HTTPS z Let's Encrypt.

```
Przeglądarka ──► Nginx (443, rejestracja.icpemission.pl)
                   ├── /            → /var/www/icpe/app/dist  (statyczny React)
                   └── /api/        → 127.0.0.1:3000          (NestJS / PM2)
                                         └── PostgreSQL (localhost:5432)
```

> Redis nie jest wymagany dla obecnej wersji (kolejki/scheduler nieaktywne). Dodasz go dopiero, gdy włączysz asynchroniczne maile/evergreen.

---

## 0. DNS
W panelu DNS domeny `icpemission.pl` dodaj rekord **A** (i AAAA jeśli masz IPv6):
```
rejestracja   A   <IP_TWOJEGO_VPS>
```
Poczekaj na propagację (`dig +short rejestracja.icpemission.pl` ma zwrócić IP serwera).

---

## 1. Pakiety systemowe
```bash
sudo apt update && sudo apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL, Nginx, narzędzia, Certbot
sudo apt install -y postgresql postgresql-contrib nginx git ufw
sudo snap install --classic certbot && sudo ln -sf /snap/bin/certbot /usr/bin/certbot

# PM2 globalnie
sudo npm install -g pm2

node -v && psql --version && nginx -v
```

(Opcjonalnie) firewall:
```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

---

## 2. Baza danych
```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE icpe WITH LOGIN PASSWORD 'SILNE_HASLO';
CREATE DATABASE icpe OWNER icpe;
GRANT ALL PRIVILEGES ON DATABASE icpe TO icpe;
SQL
```
To samo `SILNE_HASLO` wpiszesz w `DATABASE_URL` w `.env`.

---

## 3. Kod aplikacji
Wgraj repozytorium do `/var/www/icpe` (przez `git clone` albo `scp`/`rsync` z lokalnego katalogu projektu — wgraj **bez** `node_modules`, `dist`, `app/dist*`).
```bash
sudo mkdir -p /var/www/icpe && sudo chown -R $USER:$USER /var/www/icpe
# np.: git clone <repo> /var/www/icpe     albo: rsync -av --exclude node_modules ./ vps:/var/www/icpe
cd /var/www/icpe
```

### 3a. Konfiguracja środowiska
```bash
cp deploy/env.production.example .env
nano .env     # ustaw DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, SERVICE_TOKEN
```
Wygeneruj sekrety: `openssl rand -hex 32` (osobno dla `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SERVICE_TOKEN`). `API_PREFIX=api` i `CORS_ORIGIN=https://rejestracja.icpemission.pl` zostaw jak w przykładzie.

### 3b. Instalacja i build
```bash
cd /var/www/icpe
npm install                                  # instaluje wszystkie workspaces (shared/app/api)

# Backend → api/dist/main.js
npm run build --workspace=api

# Frontend → app/dist  (adres API wstrzykiwany w czasie builda)
VITE_API_URL=https://rejestracja.icpemission.pl/api npm run build --workspace=app
```

### 3c. Migracje + (opcjonalnie) dane startowe
Prisma czyta `.env` z katalogu, z którego uruchamiasz polecenie (czyli z `/var/www/icpe`):
```bash
npx prisma generate      --schema=api/prisma/schema.prisma
npx prisma migrate deploy --schema=api/prisma/schema.prisma
```
Seed jest opcjonalny i tworzy konto demo `admin@icpemission.pl / admin123` oraz przykładowe eventy. **Na produkcji** albo zmień te dane w `api/prisma/seed.ts` przed seedowaniem, albo pomiń seed i utwórz konto admina własnoręcznie. Aby zaseedować:
```bash
npx tsx api/prisma/seed.ts
```

---

## 4. Uruchomienie backendu (PM2)
```bash
cd /var/www/icpe
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup            # wykonaj polecenie, które wypisze (ustawia autostart po reboocie)

pm2 status
curl -s http://127.0.0.1:3000/api/admin/summary -H "Authorization: Bearer <SERVICE_TOKEN>" | head
```

---

## 5. Nginx + HTTPS
```bash
sudo cp deploy/nginx-rejestracja.conf /etc/nginx/sites-available/rejestracja.icpemission.pl
sudo ln -s /etc/nginx/sites-available/rejestracja.icpemission.pl /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Certyfikat Let's Encrypt (doda blok 443 i przekierowanie 80→443)
sudo certbot --nginx -d rejestracja.icpemission.pl
```
Po tym sprawdź w przeglądarce: `https://rejestracja.icpemission.pl` (front) oraz `https://rejestracja.icpemission.pl/api/docs` (Swagger).

---

## 6. Płatności i maile (gdy gotowe)
W `.env` przełącz `PAYMENTS_MODE=live` + klucze operatora (Przelewy24/PayU/Stripe) oraz `MAIL_MODE=smtp` + dane SMTP, następnie `pm2 restart icpe-api`. Webhook płatności wskaż na `https://rejestracja.icpemission.pl/api/payments/webhook/<provider>`.

---

## 7. Aktualizacje (redeploy)
```bash
cd /var/www/icpe && bash deploy/update.sh
```
Skrypt: pobiera zmiany, instaluje zależności, buduje front+back, robi `migrate deploy` i restartuje PM2.

---

## 8. Integracja Personal OS
W Personal OS ustaw:
- `ICPE_API_BASE_URL=https://rejestracja.icpemission.pl/api`
- `ICPE_API_TOKEN=<SERVICE_TOKEN z .env>`
- `ICPE_API_MODE=live`

CORS jest już ustawiony; jeśli klient łączy się z innego origin niż subdomena, dopisz go do `CORS_ORIGIN` (po przecinku) i `pm2 restart icpe-api`.

---

## Szybka diagnostyka
- `pm2 logs icpe-api` — logi backendu.
- `sudo tail -f /var/log/nginx/error.log` — błędy proxy/SSL.
- 502 z `/api` → backend nie działa (`pm2 status`) lub zły port.
- Biała strona / 404 na odświeżeniu trasy → sprawdź `try_files ... /index.html` w Nginx.
- Błąd bazy → sprawdź `DATABASE_URL` i czy `migrate deploy` przeszło.

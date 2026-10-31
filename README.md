# Macau Baronları (Supabase)

Host: GitHub Pages / Cloudflare Pages · API: Supabase.

## Yerel

```bash
npx serve web-test -p 5173
```

## Cloudflare’e bağla (en kolay — Dashboard)

1. Bu repoda `web-test/` + workflow’lar `main`’de olsun (commit/push).
2. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. GitHub → `gururp91/Clasura` yetkisi ver, repo seç
4. Ayarlar:
   - **Framework preset:** None
   - **Root directory:** `web-test`
   - **Build command:** *(boş bırak)*
   - **Build output directory:** `/`  (veya `.`)
5. **Save and Deploy**
6. Çıkan URL örn. `https://clasura.pages.dev` → iOS `APP_URL`

Her `web-test` push’unda Cloudflare yeniden deploy eder.

## iOS

`ios/KuponKasasi/ContentView.swift` içindeki `APP_URL`’i Pages URL’si yap → TestFlight.

## Not

- Supabase sadece veri/API.
- Eski `deploy-pwa.yml` hâlâ Apps Script’e yazar; cutover sonrası disable et.

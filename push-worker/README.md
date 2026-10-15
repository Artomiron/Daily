# daily-push

Cloudflare Worker, що надсилає щоденні нагадування Daily через Web Push.
Застосунок (`reminders.js`) сам надсилає підписку, час і часовий пояс; cron кожні 5 хвилин
надсилає пуш тим, у кого настав час (не частіше разу на добу). Записи щоденника сюди не потрапляють.

## Деплой

```bash
npx wrangler login
npx wrangler kv namespace create SUBS        # вставити id у wrangler.toml
npx wrangler secret put VAPID_PRIVATE_JWK    # значення — JSON з .dev.vars (без лапок)
npx wrangler deploy
```

Після деплою вписати адресу воркера в `PUSH_API_URL` у `reminders.js`.

`.dev.vars` містить приватний ключ VAPID і не потрапляє в git.

# Ripeline

Cook it before it spoils. A shared pantry for roommates with points and leaderboards.

Stack: React + Vite + Tailwind, Supabase (Auth, Postgres, Edge Functions, Storage), Claude Haiku 5.5 for receipts, hosted on Vercel. See the tech stack doc for the reasons.

## Build status

| Step | Status |
| --- | --- |
| 1. Google sign-in and households | Done |
| 2. Pantry items, sorted by soonest to spoil | Done |
| 3. Receipt scanning (Claude Haiku 5.5) | Done |
| 4. Cook, meal photo and points | Done |
| 5. Leaderboards and alerts | Done |

Done so far:

- **Step 1:** Google sign-in, start a household, join by invite code or link, roommate list, owner-only remove and new invite code, leave household, and the database for all 8 tables with row-level security.
- **Step 2:** pantry list sorted by soonest to spoil, freshness bars, Shared / Mine filter, add by hand (with an estimated use-by date), item sheet with Looks bad / Still good / Tossed, live updates between roommates, and a guard when two people edit the same item.
- **Step 3:** scan a receipt photo, Claude reads it into items, dates are estimated from the 50-item shelf-life list, review and fix before saving. The photo is never stored.

- **Step 4:** Cook tab: tick items, say how much you used, tag roommates you cooked with, take a meal photo, and get points. Points are worked out in the database (`log_meal`), so the app can't award itself points. Using a roommate's "Mine" item is allowed and they see a notice on their pantry. Household levels: Sapling at 250, Grove at 1,000, Forest at 3,000.

- **Step 5:** Board tab with monthly standings (Roommates, and Households ranked by points per person), friend households added by a separate friend code, streaks (full weeks with nothing tossed), daily "use these soon" alerts at the time each person picks, push notifications with email fallback through Resend, "a roommate used your food" alerts, and daily deletion of meal photos older than 30 days.

Points per item = 1 x type (produce, dairy, bread x2) x urgency (0-1 days left x3, 2-3 days x2) x amount used x source (added by hand x0.5), plus 2 each for cooking together, then the level bonus (Grove +5%, Forest +10%). Max 3 scored meals per person per day.

The SQL was tested on Postgres 16 with Supabase's auth stubbed: outsiders see no data, only owners remove people, the app cannot write points, past dates are blocked, points and levels add up correctly, the 3-meal daily cap holds, leaderboards rank correctly, and a friend code can't be used to join a household.

## Setup (about 15 minutes)

1. **Create a Supabase project** at supabase.com.
2. **Create the database.** In Supabase, open SQL Editor and run the files in `supabase/migrations/` in order: `0001_init.sql`, `0002_pantry.sql`, `0003_meals_points.sql`, `0004_boards_alerts.sql`.
3. **Turn on Google sign-in.**
   - In Google Cloud Console, create an OAuth client (type: Web application).
   - Add this as an authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
   - In Supabase, go to Authentication > Sign In / Providers > Google, turn it on, and paste the client ID and secret.
   - In Supabase, go to Authentication > URL Configuration. Set Site URL to `http://localhost:5173` for now, and add your Vercel URL to Redirect URLs once you deploy.
4. **Add your keys.** Copy `.env.example` to `.env` and fill in the project URL and anon key (Project Settings > API).
5. **Deploy the receipt reader.** Install the Supabase CLI, then:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy scan-receipt
   ```
   Get an API key at console.anthropic.com.
6. **Set up alerts.**
   - Make push keys: `npx web-push generate-vapid-keys`. Put the public key in `.env` as `VITE_VAPID_PUBLIC_KEY`.
   - Make a Resend account at resend.com and verify a domain you own (Resend only sends to other people's inboxes from a verified domain). Create an API key.
   - Set the secrets and deploy:
     ```
     supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@yourdomain.com
     supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="Ripeline <alerts@yourdomain.com>"
     supabase secrets set APP_URL=https://your-app.vercel.app CRON_SECRET=<any long random string>
     supabase functions deploy notify --no-verify-jwt
     ```
   - In Supabase, Database > Extensions: turn on `pg_cron` and `pg_net`. Then fill in the two placeholders in `supabase/schedules.sql` and run it in the SQL Editor.
   - Resend's free plan allows 100 emails a day. That covers a 100-person pilot if most people use push; upgrade if more than 100 people rely on email.
7. **Run it.**
   ```
   npm install
   npm run dev
   ```
   Open http://localhost:5173.

## Deploy to Vercel

Import the repo in Vercel, add the two `VITE_` variables under Environment Variables, and deploy. `vercel.json` makes invite links like `/join/abc123` work.

## Try it with two people

1. Sign in and start a household.
2. On the Household tab, tap Share invite link and send it to a second Google account.
3. The second account opens the link, signs in, and lands on Join with the code filled in.

## Project layout

```
supabase/migrations/0001_init.sql   tables, security rules, household functions
src/lib/supabase.js                 Supabase client
src/auth/AuthProvider.jsx           session + which household you're in
src/App.jsx                         routes; sends people to the right screen
src/pages/Login.jsx                 Google sign-in
src/pages/Setup.jsx                 start or join a household
src/pages/Household.jsx             roommates, invites, leave
src/pages/Pantry.jsx                pantry list, filters, item sheet
src/pages/Scan.jsx                  take receipt photo, review, save
src/pages/AddItem.jsx               add an item by hand
src/components/ItemSheet.jsx        fix dates, Looks bad / Still good, Tossed
src/lib/useItems.js                 load items, live updates, safe edits
src/lib/dates.js                    days left and freshness math
supabase/migrations/0002_pantry.sql 50-item shelf-life list, date rules
supabase/migrations/0003_meals_points.sql  log_meal (points), levels, meal photo storage
supabase/functions/scan-receipt/    reads receipts with Claude Haiku 5.5
src/pages/Cook.jsx                  log a meal and see points
src/components/UsedNotice.jsx       "Ben used half of your strawberries"
src/lib/points.js                   points preview and level math
src/pages/Board.jsx                 monthly leaderboards, friend households
src/components/AlertSettings.jsx    alert time, push on/off, email fallback
src/lib/push.js                     push setup (incl. iPhone home-screen check)
public/sw.js                        shows push notifications
supabase/migrations/0004_boards_alerts.sql  leaderboards, friends, alert settings
supabase/functions/notify/          push + email alerts, photo cleanup
supabase/schedules.sql              every-15-minute alerts, daily photo cleanup
src/components/ui.jsx               buttons, fields, avatar, freshness bar
src/index.css                       green palette, light and dark
```

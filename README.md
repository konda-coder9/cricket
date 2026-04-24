# Cricket Scoring Application

Browser-based cricket scorer with local persistence and optional Supabase cloud sync.

## Features

- Match setup (one match or tournament)
- Ball-by-ball scoring and edit previous ball
- Auto bowler prompt after each over
- Saved match tabs with edit/delete mode
- Local browser persistence
- Optional cloud sync across browsers/devices using Supabase

## Run Locally

Open `index.html` directly, or serve:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Supabase Setup (Cross-Browser/Device Data)

1. Create a Supabase project.
2. In SQL Editor, run `supabase/schema.sql`.
3. In Supabase project settings, copy:
   - Project URL
   - `anon` public key
4. Put URL and anon key in `config.js`.
5. In the app, fill **Cloud Sync (Supabase)**:
   - `Sync Space` (same value on every browser/device)
6. Click `Connect Sync`.

Notes:
- `Sync Space` is the shared key for your match bundle.
- `Pull Latest` replaces local data on that browser with cloud data.
- Local auto-save still works even if cloud is disconnected.
- The provided SQL uses open anon read/write for quick setup. Add auth-based RLS before production use.

## Host on Cloudflare Pages

1. Push this folder to a GitHub repo.
2. In Cloudflare Dashboard: `Workers & Pages` -> `Create` -> `Pages` -> `Connect to Git`.
3. Select repo and branch.
4. Build settings:
   - Build command: *(leave empty)*
   - Build output directory: `.`
5. Deploy.

After deploy, open your Pages URL, connect Supabase in Cloud Sync, and use the same `Sync Space` on other devices.

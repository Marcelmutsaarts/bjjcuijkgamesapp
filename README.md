# BJJ Games & Lessen App

## Vercel Deployment

### Stap 1: Environment Variables instellen in Vercel

Ga naar je Vercel project instellingen en voeg de volgende environment variables toe:

- `SUPABASE_URL` - Je Supabase project URL
- `SUPABASE_ANON_KEY` - Je Supabase anonymous key

### Stap 2: Deploy

Vercel zal automatisch de build script uitvoeren die de environment variables injecteert in `index.html`.

### Stap 3: Troubleshooting

Als je "Fout bij..." berichten ziet:

1. **Controleer de browser console** (F12) voor gedetailleerde error messages
2. **Verifieer dat de environment variables correct zijn ingesteld** in Vercel
3. **Controleer Supabase Row Level Security (RLS) policies**:
   - Ga naar Supabase Dashboard → Table Editor → `games` en `lessons`
   - Zorg dat RLS policies zijn ingesteld zodat `anon` gebruikers kunnen:
     - SELECT (lezen)
     - INSERT (toevoegen)
     - UPDATE (bijwerken)
     - DELETE (verwijderen)

### Voorbeeld RLS Policy (via SQL Editor in Supabase):

```sql
-- Voor games tabel
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for anon users" ON games
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Voor lessons tabel
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for anon users" ON lessons
FOR ALL
TO anon
USING (true)
WITH CHECK (true);
```

### Lokale ontwikkeling

Voor lokale ontwikkeling:
1. Maak een `.env.local` bestand met:
   ```
   SUPABASE_URL=je_supabase_url
   SUPABASE_ANON_KEY=je_supabase_anon_key
   ```
2. Run `npm run build` om de environment variables te injecteren
3. Open `index.html` in je browser of gebruik een local server

### Build Script

Het `build.js` script vervangt `%%SUPABASE_URL%%` en `%%SUPABASE_ANON_KEY%%` placeholders in `index.html` met de environment variables tijdens build time.

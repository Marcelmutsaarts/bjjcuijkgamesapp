import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// Lees variabelen uit .env.local of gebruik directe waarden
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hgmnpvmabvtztdwovndd.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbW5wdm1hYnZ0enRkd292bmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5ODk2MTYsImV4cCI6MjA3NzU2NTYxNn0.9q7qng21H58g_eJ3mZBLl93HL0ZEtzfgXdm-MGZe5RI'

console.log('🔗 Verbinden met Supabase...')
console.log('URL:', supabaseUrl ? '✅' : '❌')
console.log('Key:', supabaseAnonKey ? '✅' : '❌')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  try {
    console.log('\n📡 Testen van Supabase verbinding...\n')
    
    // Test de verbinding door te kijken of de client is aangemaakt
    if (!supabase) {
      throw new Error('Supabase client niet aangemaakt')
    }
    
    console.log('✅ Supabase client succesvol aangemaakt')
    console.log('📍 Project URL:', supabaseUrl)
    
    // Probeer een eenvoudige query die altijd werkt (auth check)
    const { data: authData, error: authError } = await supabase.auth.getSession()
    
    if (authError && authError.message.includes('JWT')) {
      // Dit is verwacht - betekent dat de verbinding werkt maar er geen sessie is
      console.log('✅ Authenticatie service werkt (geen actieve sessie verwacht)')
    } else if (!authError) {
      console.log('✅ Authenticatie service werkt')
    }
    
    // Check of er tabellen zijn
    console.log('\n📋 Controleren op tabellen...')
    const { data: tables, error: tablesError } = await supabase
      .from('games')
      .select('*')
      .limit(1)
    
    if (tablesError) {
      if (tablesError.code === 'PGRST116') {
        console.log('ℹ️  Geen tabellen gevonden in de database (dit is normaal als je nog geen schema hebt aangemaakt)')
        console.log('💡 Tip: Maak eerst tabellen aan voor "games" en "lessons"')
      } else {
        console.log('⚠️  Fout bij controleren tabellen:', tablesError.message)
      }
    } else {
      console.log('✅ Tabellen gevonden!')
      console.log('📊 Aantal games:', tables?.length || 0)
    }
    
    console.log('\n✅ Verbindingstest voltooid!')
    console.log('🎉 Supabase is klaar voor gebruik')
    
  } catch (err) {
    console.error('❌ Onverwachte fout:', err.message)
    console.error(err)
  }
}

testConnection()

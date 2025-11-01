# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BJJ Games & Lessen App - A single-page application for managing Brazilian Jiu-Jitsu (BJJ) training games and lessons using the Ecological Task Constraint Games methodology. The app allows instructors to create, organize, and compose training sessions from a library of games.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Supabase (PostgreSQL database, authentication, real-time subscriptions)
- **Deployment**: Vercel with environment variable injection
- **Data Persistence**: Supabase primary, localStorage fallback

## Development Commands

```bash
# Install dependencies
npm install

# Build (injects environment variables into index.html)
npm run build

# Test Supabase connection
npm test
```

## Environment Variables

Required for deployment (set in Vercel or local `.env.local`):
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

## Architecture

### Core Structure

The application follows a **client-side MVC pattern** with two main data managers:

1. **GameManager** (`app.js:65`) - Manages CRUD operations for games
2. **LessonManager** (`app.js:457`) - Manages CRUD operations for lessons

### Data Flow Pattern

```
User Action → Manager Method → Supabase API → Local State Update → UI Re-render
                              ↓ (on error)
                         localStorage fallback
```

**Critical**: All database operations implement graceful degradation:
- Primary: Supabase for persistent storage
- Fallback: localStorage when Supabase unavailable
- Always call `renderX()` functions after state changes to update UI

### Database Schema

**games table**:
- `id` (uuid, primary key)
- `position` (text) - BJJ position (Guard, Mount, etc.)
- `invariant` (text) - Constant rule/constraint
- `task_player_a` (text) - Objective for player A
- `task_player_b` (text) - Objective for player B
- `differentiation` (text) - Level variations
- `created_at`, `updated_at` (timestamptz)

**lessons table**:
- `id` (uuid, primary key)
- `name` (text) - Lesson name
- `description` (text) - Lesson description
- `duration` (integer) - Minutes
- `level` (text) - Skill level
- `notes` (text) - Additional notes
- `game_ids` (uuid[]) - Array of game IDs
- `created_at`, `updated_at` (timestamptz)

### Key Architectural Patterns

1. **Supabase Initialization**: The app uses a fallback CDN loading mechanism (`index.html:288-342`) that tries multiple CDNs (jsdelivr, unpkg, esm.sh) with a 5-second timeout. Wait for `supabaseReady` event before initializing managers.

2. **Field Mapping**: Database uses snake_case, app uses camelCase. Always convert when crossing this boundary:
   - DB: `task_player_a` ↔ App: `taskPlayerA`
   - DB: `game_ids` ↔ App: `gameIds`

3. **Error Handling**: All async operations log detailed error info and show user-friendly toasts. Check error structure: `{ message, code, details, hint }`.

4. **Build Process**: `build.js` injects environment variables at build time by replacing `%%SUPABASE_URL%%` and `%%SUPABASE_ANON_KEY%%` placeholders in `index.html`.

### UI Components

- **Tab System** (`index.html:18-22`): Three main views - Games, Lessons, Compose
- **Modal System**: Reusable modals for game editing, lesson viewing, confirmations, dashboard
- **Drag-and-Drop** (`app.js:1017-1085`): Lesson composition with sortable games
- **Search/Filter**: Debounced search (300ms) with position filtering and sorting options
- **Bulk Operations**: Multi-select for batch game deletion
- **Theme Toggle**: Light/dark mode with localStorage persistence

### Important Implementation Notes

1. **Supabase Client Initialization**: Always check `if (supabaseClient)` before database operations. The client is initialized after the `supabaseReady` event fires.

2. **Validation**: Both `validateGame()` (`app.js:1131`) and `validateLesson()` (`app.js:1197`) must be called before saving. Position is the only required field for games; name and at least one game are required for lessons.

3. **State Synchronization**: After any CRUD operation:
   - Update local array (`this.games` or `this.lessons`)
   - Call appropriate render function (`renderGames()`, `renderLessons()`, `renderAvailableGames()`)
   - Call `updateStats()` to refresh counters
   - Show success/error toast

4. **Data Export/Import**: The app supports full JSON export/import of both games and lessons. Import validates data structure and shows detailed confirmation before overwriting.

5. **Text Sanitization**: All user input goes through `sanitizeInput()` (`app.js:29`) with 5000 character max. HTML is escaped via `escapeHtml()` (`app.js:19`) to prevent XSS.

## Testing

Use `test-supabase.js` to verify:
- Supabase connection
- Environment variables loaded correctly
- Database tables exist
- RLS policies allow anon operations

## Deployment Notes

Vercel automatically runs `npm run build` which injects environment variables. If you see "Fout bij..." errors:
1. Check browser console for detailed errors
2. Verify environment variables in Vercel settings
3. Confirm Supabase RLS policies allow operations for `anon` role (SELECT, INSERT, UPDATE, DELETE)

## Language

The application UI is in **Dutch**. User-facing messages, toast notifications, and console logs use Dutch. Keep this consistent when adding features.

## File Structure

```
├── index.html          # Main HTML with inline Supabase loader
├── app.js             # Core application logic (2175 lines)
├── styles.css         # Complete styling with dark mode support
├── build.js           # Environment variable injection script
├── test-supabase.js   # Connection testing utility
├── package.json       # Dependencies and scripts
└── vercel.json        # Vercel deployment configuration
```

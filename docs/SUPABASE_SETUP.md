# Supabase Setup Guide

This guide walks through setting up Supabase for the purrfect-chess project.

## Overview

Supabase is configured as an optional backend service for future features like:

- Game storage and retrieval
- User accounts and authentication
- Game sharing and analysis
- Multiplayer functionality
- Leaderboards and statistics

The app works without Supabase - it's only required if you're developing features that need backend storage.

## Prerequisites

- A Supabase account (free tier available at [supabase.com](https://supabase.com))
- Node.js and Yarn installed (see main README)

## Step-by-Step Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in the project details:
   - **Name**: purrfect-chess (or your preferred name)
   - **Database Password**: Generate a strong password and save it securely
   - **Region**: Choose the region closest to your users
4. Click "Create new project"
5. Wait for the project to finish setting up (1-2 minutes)

### 2. Get Your API Credentials

1. In your Supabase project dashboard, navigate to **Settings → API**
2. You'll need these values:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon/public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (optional, for server-side operations)

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Open `.env.local` and replace the placeholder values:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   
   # Optional: For server-side admin operations only
   # SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

3. Save the file

### 4. Restart the Development Server

```bash
yarn dev
```

The app will now connect to your Supabase project.

## Using Supabase in Your Code

### Client-Side Usage (Browser)

Use the standard Supabase client for browser-side operations:

```tsx
import { supabase } from '@/lib/supabase';

// Example: Fetch data
async function fetchGames() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .limit(10);
  
  if (error) {
    console.error('Error fetching games:', error);
    return null;
  }
  
  return data;
}

// Example: Insert data
async function saveGame(fen: string) {
  const { data, error } = await supabase
    .from('games')
    .insert({ fen })
    .select()
    .single();
  
  if (error) {
    console.error('Error saving game:', error);
    return null;
  }
  
  return data;
}
```

### Server-Side Usage (API Routes)

For admin operations that bypass Row Level Security (RLS), use the admin client:

```tsx
// app/api/games/route.ts
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(request: Request) {
  if (!supabaseAdmin) {
    return Response.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .match({ id });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
```

## Database Schema

As you develop features, you'll need to create database tables. Here's an example migration for storing games:

```sql
-- Create games table
create table games (
  id uuid default gen_random_uuid() primary key,
  fen text not null,
  pgn text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table games enable row level security;

-- Create policies (example: anyone can read, authenticated users can create)
create policy "Games are viewable by everyone"
  on games for select
  using (true);

create policy "Authenticated users can create games"
  on games for insert
  with check (auth.role() = 'authenticated');

-- Create indexes
create index games_created_at_idx on games (created_at desc);
```

Run these migrations in the Supabase Dashboard under **SQL Editor**.

## TypeScript Types

Update the `Database` type in `lib/supabase.ts` as you add tables:

```typescript
export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          fen: string;
          pgn: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fen: string;
          pgn?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          fen?: string;
          pgn?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
```

For automatic type generation, use the Supabase CLI:

```bash
npx supabase gen types typescript --project-id your-project-id > lib/database.types.ts
```

## Security Best Practices

1. **Never commit `.env.local`** - it's already in `.gitignore`
2. **Use anon key in browser** - it respects Row Level Security (RLS)
3. **Use service role key only on server** - it bypasses RLS (admin access)
4. **Enable RLS on all tables** - protect your data with policies
5. **Validate user input** - never trust client-side data
6. **Use prepared statements** - Supabase does this automatically

## Testing with Supabase

For testing, you can:

1. **Use a separate Supabase project** for development/testing
2. **Mock the Supabase client** in tests:

```tsx
import { vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
  },
}));
```

## Troubleshooting

### "Missing Supabase environment variables" Error

**Cause**: The environment variables are not set or the dev server needs to be restarted.

**Solution**:
1. Ensure `.env.local` exists with valid values
2. Restart the dev server: `yarn dev`
3. Check that variable names start with `NEXT_PUBLIC_` for client-side access

### Connection Errors

**Cause**: Invalid credentials or network issues.

**Solution**:
1. Verify your Project URL and API keys in Supabase Dashboard → Settings → API
2. Check that your project is active (not paused)
3. Test the connection:
   ```tsx
   const { data, error } = await supabase.from('_health').select('*');
   console.log('Connection test:', { data, error });
   ```

### RLS Policy Errors

**Cause**: Row Level Security policies are blocking your query.

**Solution**:
1. Check your RLS policies in Supabase Dashboard → Authentication → Policies
2. Ensure your policies allow the operations you're attempting
3. Use the SQL Editor to test policies:
   ```sql
   -- Test as anonymous user
   set local role anon;
   select * from games;
   ```

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Next.js Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Design Guide](https://supabase.com/docs/guides/database/tables)

## Support

For issues specific to purrfect-chess Supabase integration:
- Open an issue on GitHub
- Check existing issues with the `supabase` label

For Supabase-specific issues:
- [Supabase GitHub Discussions](https://github.com/supabase/supabase/discussions)
- [Supabase Discord](https://discord.supabase.com/)

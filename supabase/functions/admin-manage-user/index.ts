// Supabase Edge Function: admin-manage-user
//
// Deploy with:  supabase functions deploy admin-manage-user
//
// The service-role key lives ONLY in this function's server-side
// environment (Supabase sets SUPABASE_SERVICE_ROLE_KEY automatically for
// Edge Functions - do not add it to any VITE_* variable or client code).
//
// This is the ONLY place a pharmacy_users row + matching Supabase Auth
// account may be created for someone other than the very first
// bootstrap admin (see signUpInitialAdmin in src/services/supabase.ts,
// which is itself blocked once one admin exists). There is no public
// registration endpoint - every call here requires a valid, currently
// active ADMIN session.
//
// Request body:
//   { action: 'create', name, email, password, role, phone?, license? }
//   { action: 'setStatus', userId, status: 'active' | 'inactive' }
//   { action: 'resetPassword', userId, newPassword }
//   { action: 'delete', userId }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ROLES = ['admin', 'clinician', 'cashier'];

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Admin client (service role) - never exposed to the browser.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's own token identifies a currently active admin
  // BEFORE doing anything privileged. This is the actual authorization
  // check - it runs server-side, so it cannot be bypassed by editing
  // client-side role checks.
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(callerToken);
  if (callerAuthError || !callerAuth?.user) {
    return json({ error: 'Invalid or expired session' }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await admin
    .from('pharmacy_users')
    .select('role, status')
    .eq('id', callerAuth.user.id)
    .maybeSingle();

  if (callerProfileError || !callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'active') {
    return json({ error: 'Only an active administrator may manage users' }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    switch (body.action) {
      case 'create': {
        const { name, email, password, role, phone, license } = body;
        if (!name || !email || !password || !ALLOWED_ROLES.includes(role)) {
          return json({ error: 'name, email, password and a valid role are required' }, 400);
        }
        if (String(password).length < 8) {
          return json({ error: 'Password must be at least 8 characters' }, 400);
        }

        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createError || !created?.user) {
          return json({ error: createError?.message || 'Failed to create auth account' }, 400);
        }

        const username = String(email).split('@')[0].toLowerCase();
        const { error: profileError } = await admin.from('pharmacy_users').insert({
          id: created.user.id,
          username,
          name,
          role,
          status: 'active',
          email,
          phone: phone || null,
          license_number: license || null,
          avatar_color: 'bg-teal-700',
        });

        if (profileError) {
          // Roll back the orphaned auth account so retrying doesn't collide.
          await admin.auth.admin.deleteUser(created.user.id);
          return json({ error: `Profile creation failed: ${profileError.message}` }, 400);
        }

        return json({ ok: true, userId: created.user.id });
      }

      case 'setStatus': {
        const { userId, status } = body;
        if (!userId || (status !== 'active' && status !== 'inactive')) {
          return json({ error: 'userId and a valid status are required' }, 400);
        }
        if (userId === callerAuth.user.id && status === 'inactive') {
          return json({ error: 'You cannot deactivate your own account' }, 400);
        }
        const { error } = await admin.from('pharmacy_users').update({ status }).eq('id', userId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case 'resetPassword': {
        const { userId, newPassword } = body;
        if (!userId || !newPassword || String(newPassword).length < 8) {
          return json({ error: 'userId and a password of at least 8 characters are required' }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case 'delete': {
        const { userId } = body;
        if (!userId) return json({ error: 'userId is required' }, 400);
        if (userId === callerAuth.user.id) {
          return json({ error: 'You cannot delete your own account' }, 400);
        }
        // Delete the profile first so a partial failure never leaves a
        // pharmacy_users row pointing at a deleted auth account.
        const { error: profileDeleteError } = await admin.from('pharmacy_users').delete().eq('id', userId);
        if (profileDeleteError) return json({ error: profileDeleteError.message }, 400);
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
        if (authDeleteError) return json({ error: authDeleteError.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    console.error('admin-manage-user error', e);
    return json({ error: 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

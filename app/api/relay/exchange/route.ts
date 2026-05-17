import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, code_verifier, device_id, device_name, platform } = body;

    // 1. Validate incoming payload
    if (!code || !code_verifier || !device_id) {
      return NextResponse.json(
        { error: 'Missing required fields: code, code_verifier, or device_id' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    // Instantiate Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // 2. Exchange the Auth Code for a Session
    // Supabase allows passing the code_verifier manually if initiated by a third-party client
    const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code);

    if (authError || !authData.session) {
      console.error('Auth Exchange Error:', authError);
      return NextResponse.json(
        { error: 'Invalid or expired auth code' },
        { status: 401 }
      );
    }

    const session = authData.session;
    const userId = session.user.id;

    // 3. Implicit Device Registration
    // Upsert the device record. If the device_id exists for this user, it updates the last_seen_at.
    const { error: dbError } = await supabase
      .from('relay_devices')
      .upsert(
        {
          device_id: device_id,
          user_id: userId,
          device_name: device_name || 'Unknown Device',
          platform: platform || 'unknown',
          status: 'online',
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'device_id' }
      );

    if (dbError) {
      console.error('Device Registration Error:', dbError);
      // We still have a valid auth session, but registration failed.
      // We should return a 500 to let the client know the setup is incomplete.
      return NextResponse.json(
        { error: 'Authentication successful, but device registration failed.' },
        { status: 500 }
      );
    }

    // 4. Return tokens back to the Electron Client
    return NextResponse.json(
      {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: userId,
        device_id: device_id,
        message: 'Device registered and authenticated successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error in relay exchange:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

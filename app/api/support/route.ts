import { NextResponse } from 'next/server';
import { getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';
import { createClient } from '@supabase/supabase-js';

// Public support intake. Path B: never lose a ticket — always attempt a Supabase
// insert, and only if that works try transactional email. If email infra isn't
// configured yet, the ticket still lands in the DB for the founder inbox to triage.

const SUPPORT_TABLE = 'support_tickets';

export async function POST(req: Request) {
    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(null, ip, 'mutation');
    if (!rateLimit.success) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)) } }
        );
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Honeypot — hidden by CSS, bots auto-fill it. Silently accept + drop.
    if (body.company_website) {
        return NextResponse.json({ ok: true }, { status: 200 });
    }

    const { name, email, subject, message } = body as Record<string, string>;
    if (!name || !email || !subject || !message) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (email.length > 254) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,10}$/;
    if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Cap payload size — DB column and Resend both have limits
    if (name.length > 200 || subject.length > 300 || message.length > 10000) {
        return NextResponse.json({ error: 'Field too long' }, { status: 413 });
    }

    // 1) Persist to Supabase — this is the source of truth under Path B
    const supaUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let ticketId: string | null = null;

    if (supaUrl && supaKey) {
        try {
            const supabase = createClient(supaUrl, supaKey);
            const { data, error } = await supabase
                .from(SUPPORT_TABLE)
                .insert({
                    name, email, subject, message,
                    source: 'landing-support-form',
                    ip_hash: await hashIP(ip),
                })
                .select('id')
                .single();
            if (error) {
                console.error('support insert error:', error);
            } else {
                ticketId = data?.id ?? null;
            }
        } catch (err) {
            console.error('support supabase unavailable:', err);
        }
    } else {
        console.error('support: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL missing — ticket not persisted');
    }

    // 2) Best-effort transactional email — only when Resend is configured with a
    // verified domain. Until then, silently skip: the DB row is enough to triage.
    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.SUPPORT_EMAIL_RECIPIENT) {
        try {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            const escapeHtml = (s: string) =>
                s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                 .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

            await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL,
                to: process.env.SUPPORT_EMAIL_RECIPIENT,
                subject: `[Support] ${escapeHtml(String(subject))}`,
                replyTo: email,
                html: `
                  <h2>New Support Request${ticketId ? ` (${ticketId})` : ''}</h2>
                  <p><strong>From:</strong> ${escapeHtml(String(name))} (${escapeHtml(String(email))})</p>
                  <p><strong>Subject:</strong> ${escapeHtml(String(subject))}</p>
                  <p><strong>Message:</strong></p>
                  <blockquote style="background-color: #f3f4f6; padding: 12px; border-left: 4px solid #d1d5db;">
                    ${escapeHtml(String(message)).replace(/\n/g, '<br>')}
                  </blockquote>
                `,
            });
        } catch (err) {
            // Email failure should not mask a successful DB insert
            console.error('support email send failed (ticket still persisted):', err);
        }
    }

    // Fail if the ticket never landed anywhere
    if (!ticketId) {
        return NextResponse.json({ error: 'Could not record your request — please try again shortly.' }, { status: 503 });
    }

    return NextResponse.json({ ok: true, ticketId }, { status: 200 });
}

async function hashIP(ip: string): Promise<string> {
    const enc = new TextEncoder().encode(ip + (process.env.SALT_IP_HASH || 'lattice-support'));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

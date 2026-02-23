import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getClientIP } from '@/lib/security/apiAuth';
import { limitApiEndpoint } from '@/lib/security/rateLimit';

export async function POST(req: Request) {
    if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY is not set. Support emails will fail.');
        return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
    }

    const ip = getClientIP(req);
    const rateLimit = await limitApiEndpoint(null, ip, 'mutation');
    if (!rateLimit.success) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.reset - Date.now()) / 1000)) } }
        );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const escapeHtml = (str: string) =>
        str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    try {
        const body = await req.json();
        const { name, email, subject, message } = body;

        // specific validation
        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        const safeName = escapeHtml(String(name));
        const safeEmail = escapeHtml(String(email));
        const safeSubject = escapeHtml(String(subject));
        const safeMessage = escapeHtml(String(message));

        const data = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: process.env.SUPPORT_EMAIL_RECIPIENT || 'support@example.com',
            subject: `Support Request: ${safeSubject}`,
            html: `
        <h2>New Support Request</h2>
        <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="background-color: #f3f4f6; padding: 12px; border-left: 4px solid #d1d5db;">
          ${safeMessage.replace(/\n/g, '<br>')}
        </blockquote>
      `,
            replyTo: email as string,
        });

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error sending email:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

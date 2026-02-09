
import * as React from 'react';

interface DailyBriefingEmailProps {
    userName: string;
    highlights: string[];
    actionItems: string[];
    focusSuggestion: string;
    quote: string;
}

export const DailyBriefingEmail: React.FC<DailyBriefingEmailProps> = ({
    userName,
    highlights,
    actionItems,
    focusSuggestion,
    quote,
}) => (
    <div style={{ fontFamily: 'sans-serif', lineHeight: '1.6', color: '#1a1a1a', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ backgroundColor: '#f4f4f5', padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
            <h1 style={{ margin: '0 0 16px 0', color: '#3f3f46', fontSize: '24px' }}>Good Morning, {userName}</h1>
            <p style={{ margin: '0', color: '#71717a' }}>Here is your daily briefing to kickstart your day.</p>
        </div>

        <div style={{ marginBottom: '32px' }}>
            <h2 style={{ color: '#2563eb', borderBottom: '2px solid #e4e4e7', paddingBottom: '8px', fontSize: '18px' }}>Yesterday's Highlights</h2>
            <ul style={{ paddingLeft: '20px' }}>
                {highlights.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: '8px' }}>{item}</li>
                ))}
            </ul>
            {highlights.length === 0 && <p style={{ fontStyle: 'italic', color: '#a1a1aa' }}>No major highlights recorded.</p>}
        </div>

        <div style={{ marginBottom: '32px' }}>
            <h2 style={{ color: '#db2777', borderBottom: '2px solid #e4e4e7', paddingBottom: '8px', fontSize: '18px' }}>Action Items</h2>
            <ul style={{ paddingLeft: '20px' }}>
                {actionItems.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: '8px', fontWeight: '500' }}>{item}</li>
                ))}
            </ul>
            {actionItems.length === 0 && <p style={{ fontStyle: 'italic', color: '#a1a1aa' }}>You're all caught up!</p>}
        </div>

        <div style={{ marginBottom: '32px', backgroundColor: '#eff6ff', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #2563eb' }}>
            <h2 style={{ margin: '0 0 8px 0', color: '#1e40af', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎯 Today's Focus</h2>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: '600', color: '#1e3a8a' }}>{focusSuggestion}</p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '48px', color: '#a1a1aa', fontSize: '14px', fontStyle: 'italic' }}>
            "{quote}"
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', borderTop: '1px solid #e4e4e7', paddingTop: '24px' }}>
            <a href="https://gen1e.xyz/dashboard" style={{ display: 'inline-block', backgroundColor: '#18181b', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold' }}>Open Workspace</a>
        </div>
    </div>
);

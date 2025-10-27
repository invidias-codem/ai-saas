// app/not-found.tsx (or app/_not-found/page.tsx)

import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Page Not Found</h2>
      <p style={{ marginTop: '0.5rem', color: '#888' }}>
        Could not find the requested resource.
      </p>
      <Link 
        href="/dashboard" 
        style={{ 
          marginTop: '1.5rem', 
          padding: '0.5rem 1rem', 
          backgroundColor: '#333', 
          color: 'white', 
          borderRadius: '0.25rem',
          textDecoration: 'none'
        }}
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
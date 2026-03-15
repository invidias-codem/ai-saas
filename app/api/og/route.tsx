import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const title = searchParams.get('title') || 'Gen1e Agent';

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#000000',
                        backgroundImage: 'linear-gradient(to bottom right, #000000 0%, #111111 100%)',
                        color: 'white',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px 40px',
                            backgroundColor: '#6366f1',
                            borderRadius: '20px',
                            fontSize: 60,
                            fontWeight: 'bold',
                            color: 'white',
                            marginBottom: 40,
                            boxShadow: '0 10px 30px rgba(99, 102, 241, 0.4)',
                        }}
                    >
                        {title.charAt(0)}
                    </div>
                    <div
                        style={{
                            fontSize: 80,
                            fontWeight: '900',
                            background: 'linear-gradient(to right, #fff, #aaa)',
                            backgroundClip: 'text',
                            color: 'transparent',
                            textAlign: 'center',
                            padding: '0 40px',
                        }}
                    >
                        {title}
                    </div>
                    <div style={{ fontSize: 30, color: '#666', marginTop: 30 }}>
                        Powered by Gen1e
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
            },
        );
    } catch (e: any) {
        return new Response(`Failed to generate the image`, {
            status: 500,
        });
    }
}

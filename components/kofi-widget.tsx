"use client";

export const KoFiWidget = () => {
    // Centralized Ko-fi page so we never hardcode the recipient in multiple
    // places. Falls back to the owner's verified page.
    const KOFI_PAGE = process.env.NEXT_PUBLIC_KOFI_PAGE || "joshuajair";
    const src = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;
    return (
        <div className="w-full h-full min-h-[600px] bg-[#f9f9f9] rounded-xl overflow-hidden">
            <iframe
                id='kofiframe'
                src={src}
                style={{ border: 'none', width: '100%', padding: '4px', background: '#f9f9f9' }}
                height='712'
                title={KOFI_PAGE}
            ></iframe>
        </div>
    );
};

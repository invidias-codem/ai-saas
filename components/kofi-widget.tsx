"use client";

export const KoFiWidget = () => {
    return (
        <div className="w-full h-full min-h-[600px] bg-[#f9f9f9] rounded-xl overflow-hidden">
            <iframe
                id='kofiframe'
                src='https://ko-fi.com/joshuajair/?hidefeed=true&widget=true&embed=true&preview=true'
                style={{ border: 'none', width: '100%', padding: '4px', background: '#f9f9f9' }}
                height='712'
                title='joshuajair'
            ></iframe>
        </div>
    );
};

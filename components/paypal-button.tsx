"use client";

export const PayPalButton = () => {
  const url =
    process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL ||
    "https://ko-fi.com/joshuajair/?hidefeed=true&widget=true&embed=true&preview=true";

  return (
    <div className="w-full rounded-xl overflow-hidden border border-border bg-[#f9f9f9]">
      <iframe
        id="kofiframe"
        src={url}
        style={{ border: "none", width: "100%", padding: "4px", background: "#f9f9f9" }}
        height="712"
        title="joshuajair"
        allow="payment"
      />
    </div>
  );
};

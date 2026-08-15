"use client";

export const PayPalButton = () => {
  const url = process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL || "https://www.paypal.com/joshuajair";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center rounded-xl px-4 py-3 bg-[#003087] text-white font-semibold hover:bg-[#001f5c] transition-colors w-full"
    >
      Donate with PayPal
    </a>
  );
};

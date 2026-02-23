import { redirect } from "next/navigation";

export default function RootPage() {
    // redirect to the default language
    redirect("/en/general");
}

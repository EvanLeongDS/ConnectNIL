import type { Metadata } from "next";
import SiteNav from "@/components/landing/SiteNav";
import SiteBackground from "@/components/landing/SiteBackground";
import SiteFooter from "@/components/landing/SiteFooter";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact — ConnectNIL",
  description: "Get in touch with the ConnectNIL team.",
};

/**
 * Server shell so this page gets the real SiteNav and SiteFooter, like /about and /faq.
 *
 * It previously hand-rolled a nav containing only the logo, the theme toggle and a "Log in"
 * link — which meant no Sign Up anywhere on the page, no About/FAQ links, no footer, and a
 * signed-in visitor being offered "Log in" for a destination the middleware would bounce
 * them away from. SiteNav is an async server component, so the form had to move into its
 * own client module for this to be possible at all.
 */
export default function ContactPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip text-black dark:text-white">
      <SiteBackground />
      <div className="relative z-10 min-h-screen">
        <SiteNav />
        <ContactForm />
        <SiteFooter />
      </div>
    </div>
  );
}

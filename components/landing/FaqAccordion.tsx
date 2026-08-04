"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";

const FAQ_ITEMS = [
  {
    title: "What is ConnectNIL?",
    content:
      "ConnectNIL is a platform that helps athletes, teams, and brands create and manage Name, Image, and Likeness (NIL) partnerships—especially structured, season-long team deals—in one place.",
  },
  {
    title: "Who can use ConnectNIL?",
    content:
      "Athletes can join team rosters and opt into deals. Team managers coordinate rosters and partnerships. Brands discover teams and run campaigns with clear deliverables and compensation.",
  },
  {
    title: "How do team NIL deals work?",
    content:
      "Teams and brands agree on partnership terms on the platform. Athletes on the roster are notified, can opt in, and then complete deliverables with proof submissions while everyone tracks progress in the dashboard.",
  },
  {
    title: "Is ConnectNIL free to sign up?",
    content:
      "You can create an account and explore the platform. Specific pricing for premium features may apply—check your dashboard or contact us for details.",
  },
];

export default function FaqAccordion() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {FAQ_ITEMS.map((item, index) => (
        <AccordionItem
          key={item.title}
          value={`faq-${index + 1}`}
          className="border-b border-[#1f7ae0]/20 last:border-b-0 dark:border-[#93c5fd]/20"
        >
          <AccordionTrigger showArrow className="text-[#1f7ae0] dark:text-[#93c5fd]">
            {item.title}
          </AccordionTrigger>
          <AccordionContent className="text-[#1f7ae0]/90 dark:text-[#93c5fd]/85">
            {item.content}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

import React from "react";
import { SectionHeading } from "../shared/SectionHeading";
import { LogoLarge } from "../navigation/Logo";
import TerminalContact from "./TerminalContact";

const FINAL_CTA_TEXTS = {
  heading: "Become an Early Adopter",
  subheading: "Join our Early Access Program and receive free integration plus a 30% lifetime discount. Limited spots available.",
};

const FinalCTA = () => {
  return (
    <section id="final-cta" className="-mt-8 bg-white px-2 py-24 md:px-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row items-start gap-12">
          <div className="flex-1 flex flex-col items-start">
            <SectionHeading>{FINAL_CTA_TEXTS.heading}</SectionHeading>
            <p className="text-left text-base leading-relaxed md:text-xl md:leading-relaxed">
              {FINAL_CTA_TEXTS.subheading}
            </p>
          </div>
          <div className="flex-1 w-full">
            <TerminalContact />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;

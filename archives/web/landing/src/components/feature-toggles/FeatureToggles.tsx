import React, { useState } from "react";
import { ToggleButton } from "./ToggleButton";
import { data } from "./data";
import { FeatureDisplay } from "./FeatureDisplay";
import { SectionHeading } from "../shared/SectionHeading";
import { SectionSubheading } from "../shared/SectionSubheading";

const FEATURE_TOGGLES_TEXTS = {
  heading: (
    <>
      <span className="text-indigo-600">Nuwa Agent Stack</span>
      <br />
      <span className="text-3xl md:text-4xl">Secure, Modular, Made for Web3</span>
    </>
  ),
  subheading: "Nuwa provides the complete tech stack for Web3 protocols to deploy AI agents that can directly interact with on-chain smart contracts while maintaining robust security."
};

const FeatureToggles = () => {
  const [selected, setSelected] = useState(1);

  const el = data.find((d) => d.id === selected);

  return (
    <section className="relative mx-auto max-w-6xl px-2 md:px-4 flex w-full flex-col items-center justify-center text-center">
      <SectionHeading>{FEATURE_TOGGLES_TEXTS.heading}</SectionHeading>
      <SectionSubheading>
        {FEATURE_TOGGLES_TEXTS.subheading}
      </SectionSubheading>
      <div className="w-full">
        <div className="mb-9 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
          {data.map((d) => (
            <ToggleButton
              key={d.id}
              id={d.id}
              selected={selected}
              setSelected={setSelected}
            >
              {d.title}
            </ToggleButton>
          ))}
        </div>
        <div className="w-full translate-y-2 rounded-xl bg-zinc-900">
          <div className="w-full -translate-y-2 rounded-lg shadow-lg">
            <FeatureDisplay
              selected={selected}
              cardTitle={el!.cardTitle}
              cardSubtitle={el!.cardSubtitle}
              imagePath={el!.imagePath}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeatureToggles;

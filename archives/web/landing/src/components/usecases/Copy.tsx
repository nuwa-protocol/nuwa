import React, { Dispatch, SetStateAction } from "react";
import { CheckPill } from "./CheckPill";
import { OPTIONS } from "./options";

export const Copy = ({
  selected,
  setSelected,
}: {
  selected: number;
  setSelected: Dispatch<SetStateAction<number>>;
}) => {
  return (
    <div className="w-full">
      <h1 className="mb-1.5 text-4xl font-bold block text-center text-indigo-600 md:text-start">
        Usecases
      </h1>
      <h2 className="mb-3 text-center text-4xl font-bold leading-tight md:text-start md:text-5xl md:leading-tight">
        Transform Every Web3 Experience with AI Agents
      </h2>
      <p className="mb-6 text-center text-base leading-relaxed md:text-start md:text-lg md:leading-relaxed">
        The next wave of Web3 growth won’t come from better tech — it’ll come from better experiences.
        <br />
        Nuwa bridges the gap with AI agents that turn complex blockchain logic into simple, human-like interactions.
        <br />
        Don’t let your protocol be left behind — lead the shift to an AI-native Web3.
      </p>
      <div className="mb-6 flex flex-wrap justify-center gap-3 md:justify-start">
        {OPTIONS.map((o, i) => {
          return (
            <CheckPill
              key={o.title}
              index={i}
              selected={i === selected}
              setSelected={setSelected}
            >
              {o.title}
            </CheckPill>
          );
        })}
      </div>
    </div>
  );
};

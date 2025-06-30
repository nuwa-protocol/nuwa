import React from 'react';
import { OnboardingGuard } from '../components/onboarding/OnboardingGuard';

export const OnboardingPage: React.FC = () => {
  return (
    <OnboardingGuard>
      {/* Empty child element; OnboardingGuard will navigate based on target parameter after completion */}
      <></>
    </OnboardingGuard>
  );
};

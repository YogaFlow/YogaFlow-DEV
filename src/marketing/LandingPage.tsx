import { ClosingCta } from './sections/ClosingCta';
import { Demo } from './sections/Demo';
import { Faq } from './sections/Faq';
import { Footer } from './sections/Footer';
import { Header } from './sections/Header';
import { Hero } from './sections/Hero';
import { ParticipantEntry } from './sections/ParticipantEntry';
import { Problem } from './sections/Problem';
import { Promises } from './sections/Promises';
import { Setup } from './sections/Setup';
import { Transparency } from './sections/Transparency';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-sand font-body text-text">
      <Header />
      <main>
        <Hero />
        <Problem />
        <Demo />
        <Promises />
        <Setup />
        <Transparency />
        <Faq />
        <ClosingCta />
        <ParticipantEntry />
      </main>
      <Footer />
      <div className="marketing-grain" aria-hidden="true" />
    </div>
  );
}

import { ClosingCta } from './sections/ClosingCta';
import { DemoPlaceholder } from './sections/DemoPlaceholder';
import { Faq } from './sections/Faq';
import { Footer } from './sections/Footer';
import { Header } from './sections/Header';
import { Hero } from './sections/Hero';
import { ParticipantEntry } from './sections/ParticipantEntry';
import { Problem } from './sections/Problem';
import { Promises } from './sections/Promises';
import { Transparency } from './sections/Transparency';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-sand font-body text-text">
      <Header />
      <main>
        <Hero />
        <Problem />
        <DemoPlaceholder />
        <Promises />
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

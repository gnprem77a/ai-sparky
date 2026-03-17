import { PublicLayout } from "./AboutPage";

const LAST_UPDATED = "March 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      <div className="text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <PublicLayout title="Terms of Service">
      <p className="text-sm text-muted-foreground mb-8 pb-6 border-b border-border">
        Last updated: <strong>{LAST_UPDATED}</strong>. By using AI Sparky, you agree to these terms.
      </p>

      <Section title="1. Acceptance of terms">
        <p>
          By accessing or using AI Sparky, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <p>
          You must be at least 13 years old to use AI Sparky. By creating an account, you confirm that you meet this age requirement.
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          You are responsible for keeping your login credentials secure. You must not share your account with others or allow others to access the service using your credentials. Notify us immediately if you suspect unauthorised access.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to use AI Sparky to:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Generate content that is illegal, harmful, threatening, or abusive</li>
          <li>Infringe the intellectual property rights of others</li>
          <li>Attempt to reverse engineer, scrape, or overload the platform</li>
          <li>Circumvent usage limits or rate limiting</li>
          <li>Impersonate other people or entities</li>
          <li>Distribute spam or malware</li>
        </ul>
        <p>
          We reserve the right to suspend or terminate accounts that violate these rules, without notice.
        </p>
      </Section>

      <Section title="5. AI-generated content">
        <p>
          AI Sparky uses large language models to generate responses. These responses may be inaccurate, incomplete, or outdated. Do not rely on AI-generated content for medical, legal, financial, or safety decisions without consulting a qualified professional.
        </p>
        <p>
          You own the output you generate. We do not claim ownership over your conversations or any content you create using the service.
        </p>
      </Section>

      <Section title="6. External API">
        <p>
          If you are granted API access, you must not share your API key or use it in ways that violate these terms. Excessive or abusive API usage may result in rate limiting or key revocation.
        </p>
      </Section>

      <Section title="7. Service availability">
        <p>
          We aim to keep AI Sparky available at all times, but we do not guarantee uninterrupted access. The service may be temporarily unavailable due to maintenance, outages, or circumstances beyond our control. We are not liable for any loss arising from service downtime.
        </p>
      </Section>

      <Section title="8. Limitation of liability">
        <p>
          To the maximum extent permitted by law, AI Sparky is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the service.
        </p>
      </Section>

      <Section title="9. Changes to the service">
        <p>
          We reserve the right to modify, suspend, or discontinue any part of AI Sparky at any time. We may also update these terms. Continued use after changes constitutes acceptance of the updated terms.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          These terms are governed by applicable law. Any disputes will be resolved in the courts of the jurisdiction in which the service is operated.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          If you have any questions about these Terms of Service, please contact us via the <a href="/contact" className="text-primary hover:underline">Contact page</a>.
        </p>
      </Section>
    </PublicLayout>
  );
}

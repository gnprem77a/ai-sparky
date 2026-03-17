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

export default function PrivacyPage() {
  return (
    <PublicLayout title="Privacy Policy">
      <p className="text-sm text-muted-foreground mb-8 pb-6 border-b border-border">
        Last updated: <strong>{LAST_UPDATED}</strong>
      </p>

      <Section title="1. What we collect">
        <p>
          When you create an account, we collect your username, email address, and a hashed version of your password. We never store your password in plain text.
        </p>
        <p>
          We also store the conversations you have with AI Sparky so you can access them again later. You can delete any conversation at any time.
        </p>
        <p>
          If you use the external API, we log request counts and timestamps for rate-limiting and billing purposes.
        </p>
      </Section>

      <Section title="2. How we use your data">
        <p>We use your data solely to provide and improve the service:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Delivering AI responses to your messages</li>
          <li>Maintaining your conversation history</li>
          <li>Sending transactional emails (account verification, password resets, plan changes)</li>
          <li>Enforcing usage limits and preventing abuse</li>
        </ul>
      </Section>

      <Section title="3. We never train on your conversations">
        <p>
          Your conversations are <strong className="text-foreground">never</strong> used to train AI models — neither ours nor any third-party provider's. What you type stays private to you.
        </p>
      </Section>

      <Section title="4. Third-party AI providers">
        <p>
          To deliver AI responses, your messages are sent to third-party language model providers (such as OpenAI, Anthropic, or Google). These providers process your message to generate a response and are contractually bound not to use your data for training. We recommend reviewing their privacy policies for full details.
        </p>
      </Section>

      <Section title="5. Data retention">
        <p>
          Your account and conversation data are retained for as long as your account is active. You can delete individual conversations at any time. To request full account deletion, contact us and we will remove your data within 30 days.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          All data is transmitted over HTTPS. Passwords are hashed using industry-standard algorithms. API keys and SMTP credentials are encrypted at rest using AES-256-GCM. We apply access controls so only you can see your conversations.
        </p>
      </Section>

      <Section title="7. Cookies">
        <p>
          We use a single session cookie to keep you logged in. We do not use advertising cookies or third-party tracking cookies.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, or delete the personal data we hold about you. To exercise any of these rights, contact us via the <a href="/contact" className="text-primary hover:underline">Contact page</a>.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we'll update the "Last updated" date at the top of this page. Continued use of AI Sparky after changes means you accept the updated policy.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          If you have any questions about this Privacy Policy, please reach out via our <a href="/contact" className="text-primary hover:underline">Contact page</a>.
        </p>
      </Section>
    </PublicLayout>
  );
}

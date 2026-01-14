import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function PrivacyPolicyPage() {
  useDocumentTitle('Notism - Privacy Policy');

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: January 14, 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="text-muted-foreground">
          Notism ("we", "us") provides an AI-powered study workspace for lecture files and notes.
          We act as the data controller for personal data processed through the service. This policy
          explains what we collect, why we collect it, and how you can exercise your rights under the GDPR.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Data we collect</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Account data such as name, email address, and authentication identifiers.</li>
          <li>Files and content you upload, along with generated transcripts, summaries, quizzes, and flashcards.</li>
          <li>Usage data like feature interactions, device details, and logs required for security and reliability.</li>
          <li>Essential cookies that keep you signed in and remember consent preferences.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">How we use your data</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Provide and improve transcription, summarization, and study tools.</li>
          <li>Authenticate your account and prevent abuse or fraud.</li>
          <li>Maintain the security, performance, and availability of the platform.</li>
          <li>Comply with legal obligations and respond to lawful requests.</li>
        </ul>
        <p className="text-muted-foreground">
          Our legal bases include contract performance (providing the service), legitimate interests
          (security and improvement), and consent where required (cookie preferences).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Processors and data sharing</h2>
        <p className="text-muted-foreground">
          We use trusted processors to deliver the service. Your files may be sent to OpenAI and Groq
          for transcription, and stored in Cloudflare (R2 for file storage and D1 for database storage).
          We also rely on authentication providers to manage access. These partners process data under
          our instructions and only for the purposes described here.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">International transfers</h2>
        <p className="text-muted-foreground">
          Your data may be processed outside the EEA. When this occurs, we rely on appropriate safeguards
          such as standard contractual clauses to protect your information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Retention</h2>
        <p className="text-muted-foreground">
          We retain your account data and files for as long as you maintain an account or as needed to
          provide the service. You can request deletion at any time, and we will remove or anonymize data
          unless we must keep it for legal reasons.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your GDPR rights</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Access, correct, or delete your personal data.</li>
          <li>Restrict or object to processing, or request data portability.</li>
          <li>Withdraw consent at any time for consent-based processing.</li>
          <li>Lodge a complaint with your local supervisory authority.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-muted-foreground">
          For privacy questions or GDPR requests, email us at info@notism.one.
        </p>
      </section>
    </div>
  );
}

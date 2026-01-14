import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function TermsOfServicePage() {
  useDocumentTitle('Notism - Terms of Service');

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: January 14, 2026</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Acceptance of terms</h2>
        <p className="text-muted-foreground">
          By creating an account, uploading content, or using Notism, you agree to these Terms and our
          Privacy Policy. If you do not agree, do not use the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">The service</h2>
        <p className="text-muted-foreground">
          Notism provides transcription, summarization, and study tools for lecture files. You are
          responsible for ensuring you have rights to upload and process any content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">AI processing and hosting</h2>
        <p className="text-muted-foreground">
          By using the service, you instruct us to transmit your files and related content to OpenAI and
          Groq for transcription. You also agree that your files are stored in Cloudflare (R2 storage) and
          that metadata and transcripts are stored in Cloudflare D1. These processors act on our behalf
          and only for providing the service, in line with GDPR requirements.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Your responsibilities</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Provide accurate account information and keep your credentials secure.</li>
          <li>Upload only content you have permission to share.</li>
          <li>Do not use the service for unlawful, harmful, or abusive activities.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Availability and changes</h2>
        <p className="text-muted-foreground">
          We may update, suspend, or modify the service to improve functionality or comply with legal
          requirements. If we make material changes, we will provide notice through the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Termination</h2>
        <p className="text-muted-foreground">
          You can stop using the service at any time. We may suspend accounts that violate these Terms
          or pose security risks. You can request deletion of your data as described in the Privacy Policy.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-muted-foreground">
          Questions about these Terms can be sent to info@notism.one.
        </p>
      </section>
    </div>
  );
}

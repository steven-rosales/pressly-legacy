import { LegalDocumentPage } from '@/app/shared/ui/public/LegalDocumentPage';
import type { LegalDocumentModel } from '@/app/shared/legal/model';

export function LegalDocumentView({ model }: { model: LegalDocumentModel }) {
  return (
    <LegalDocumentPage
      title={model.title}
      updatedLabel={model.updatedLabel}
    >
      {model.sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mb-3 text-muted-foreground">
              {paragraph}
            </p>
          ))}
          {section.bullets === undefined ? null : (
            <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
          {section.contact === undefined ? null : (
            <p className="text-muted-foreground">
              {section.contact.intro}{' '}
              <a
                href={`mailto:${section.contact.email}`}
                className="text-primary underline underline-offset-4"
              >
                {section.contact.email}
              </a>{' '}
              or call us at{' '}
              <a
                href={section.contact.phoneHref}
                className="text-primary underline underline-offset-4"
              >
                {section.contact.phone}
              </a>
              .
            </p>
          )}
        </div>
      ))}
    </LegalDocumentPage>
  );
}

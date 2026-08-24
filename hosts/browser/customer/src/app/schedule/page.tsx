import { customerWeb } from '@pressly/generated-runtime/browser/customer';

export const metadata = customerWeb.schedule.metadata;
export const viewport = customerWeb.schedule.viewport;
export default function SchedulePage() {
  return <customerWeb.schedule.Page />;
}

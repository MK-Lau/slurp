"use client";

import { Btn, Card, ModalOverlay } from "@/components/ui";

interface Props {
  joined: number;
  expectedTotal: number;
  /** When set, "Continue anyway" is a real anchor (keeps the venmo:// deeplink working). */
  continueHref?: string;
  /** Used instead of continueHref for in-app actions like marking yourself paid. */
  onContinue?: () => void;
  onCancel: () => void;
}

export default function PartyIncompleteModal({
  joined,
  expectedTotal,
  continueHref,
  onContinue,
  onCancel,
}: Props): React.JSX.Element {
  // Single interpolated string — interleaving {expr} with wrapped JSX text drops the
  // spaces around the expressions when the line reflows.
  const body = `Only ${joined} of ${expectedTotal} have joined. Your share may change once the rest claim their items.`;

  return (
    <ModalOverlay>
      <Card className="p-6 max-w-xs w-full shadow-xl">
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Not everyone has joined yet
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">{body}</p>
        <div className="flex gap-2">
          {continueHref ? (
            <a
              href={continueHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
              onClick={onContinue}
            >
              <Btn variant="outline" className="w-full">Continue anyway</Btn>
            </a>
          ) : (
            <Btn variant="outline" className="flex-1" onClick={onContinue}>
              Continue anyway
            </Btn>
          )}
          <Btn variant="secondary" className="flex-1" onClick={onCancel}>
            Wait
          </Btn>
        </div>
      </Card>
    </ModalOverlay>
  );
}

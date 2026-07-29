"use client";

import { Btn, Card } from "@/components/ui";

interface Props {
  joined: number;
  expectedTotal: number;
  missing: number;
  /** When set, "Continue anyway" is a real anchor (keeps the venmo:// deeplink working). */
  continueHref?: string;
  /** Used instead of continueHref for in-app actions like marking yourself paid. */
  onContinue?: () => void;
  onCancel: () => void;
}

export default function PartyIncompleteModal({
  joined,
  expectedTotal,
  missing,
  continueHref,
  onContinue,
  onCancel,
}: Props): React.JSX.Element {
  const people = missing === 1 ? "person" : "people";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <Card className="p-6 max-w-xs w-full shadow-xl">
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Not everyone has joined yet
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {joined} of {expectedTotal} people have joined. The {missing} {people} still missing can
          claim items once they join, so items you&rsquo;re splitting may be split further and your
          share may change.
        </p>
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
    </div>
  );
}

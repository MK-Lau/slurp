"use client";

import { useEffect, useRef, useState } from "react";
import { updateSlurp } from "@/lib/slurps";
import type { Slurp } from "@slurp/types";
import { MAX_PARTICIPANTS } from "@slurp/types";
import { Field, NumberInput } from "@/components/ui";

const MAX_GUESTS = MAX_PARTICIPANTS - 1;

interface Props {
  slurp: Slurp;
  onUpdate: (d: Slurp) => void;
}

function toInput(expectedGuests: number | undefined): string {
  return expectedGuests != null ? String(expectedGuests) : "";
}

export default function GuestCountForm({ slurp, onUpdate }: Props): React.JSX.Element {
  const [value, setValue] = useState(toInput(slurp.expectedGuests));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setValue(toInput(slurp.expectedGuests));
  }, [slurp.expectedGuests]);

  async function save(raw: string): Promise<void> {
    const trimmed = raw.trim();
    let expectedGuests: number | null;

    if (trimmed === "") {
      expectedGuests = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || n > MAX_GUESTS) {
        setError(`Enter a whole number between 0 and ${MAX_GUESTS}`);
        setValue(toInput(slurp.expectedGuests));
        return;
      }
      expectedGuests = n;
    }

    if (expectedGuests === (slurp.expectedGuests ?? null)) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateSlurp(slurp.id, { expectedGuests });
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setValue(toInput(slurp.expectedGuests));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 mb-3">
      <Field
        label="Expected guests"
        hint="Not counting you. Leave blank if you're not sure."
      >
        <NumberInput
          step="1"
          min="0"
          max={MAX_GUESTS}
          placeholder="e.g. 3"
          value={value}
          aria-label="Expected guests"
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => { focusedRef.current = false; void save(value); }}
        />
      </Field>
      {saving && <p className="text-xs text-gray-400">Saving…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

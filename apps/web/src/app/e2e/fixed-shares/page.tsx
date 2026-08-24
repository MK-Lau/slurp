import { notFound } from "next/navigation";
import FixedSharesHarness from "./FixedSharesHarness";

export const dynamic = "force-dynamic";

export default function FixedSharesE2EPage(): React.JSX.Element {
  if (process.env.E2E_TEST !== "1") notFound();
  return <FixedSharesHarness />;
}

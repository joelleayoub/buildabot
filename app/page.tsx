import { Workspace } from "@/components/Workspace";
import { jsonCatalog } from "@/lib/advisor/agent";
import { SAMPLE_BUILDS } from "@/lib/sampleBuilds";

export default async function Home() {
  const parts = await jsonCatalog.parts();
  return <Workspace parts={parts} samples={SAMPLE_BUILDS} />;
}

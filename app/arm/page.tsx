import type { Metadata } from "next";
import ArmClient from "@/components/arm/ArmClient";

export const metadata: Metadata = {
  title: "Robot arm advisor | buildabot",
  description: "Describe a task and get the right kind of robot, motor sizes for every joint, a parts list and proven open-source designs.",
};

export default function ArmPage() {
  return <ArmClient />;
}

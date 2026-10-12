// Renders one part in a studio so scripts/render-part-shots.mjs can save it as a product image.
// Only available in development.
import { notFound } from "next/navigation";
import ShotClient from "./ShotClient";

export default function ShotPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ShotClient />;
}

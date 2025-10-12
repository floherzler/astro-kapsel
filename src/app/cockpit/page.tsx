"use client";

import CockpitLayout from "@/components/CockpitLayout";
import { EarthObservationViewport } from "@/components/space/earth-observation-viewport";

export default function CockpitPage() {
  return (
    <CockpitLayout>
      <EarthObservationViewport />
    </CockpitLayout>
  );
}

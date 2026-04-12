import { Suspense } from "react";
import CoolStudioClient from "./CoolStudioClient";

function CoolStudioFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F1EC] px-6 text-[#2F2F2F]">
      <div className="w-full max-w-sm rounded-2xl border border-[#D8D2C8] bg-[#F8F6F2] p-5 text-sm shadow-sm">
        <div className="font-medium">Loading Cool Studio...</div>
        <div className="mt-2 text-[#6B6B6B]">Preparing editor state.</div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#DED7CD]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#7A8C99]" />
        </div>
      </div>
    </div>
  );
}

export default function CoolStudioPage() {
  return (
    <Suspense fallback={<CoolStudioFallback />}>
      <CoolStudioClient />
    </Suspense>
  );
}

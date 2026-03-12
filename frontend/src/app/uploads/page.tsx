"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UploadsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/upload");
  }, [router]);
  return null;
}

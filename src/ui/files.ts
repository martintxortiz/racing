/** Ask the browser for one file. Resolves null on cancel. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const SAMPLE_URL = process.env.NEXT_PUBLIC_SAMPLE_MCAP_URL || "https://adept-viper-806.eu-west-1.convex.cloud/api/storage/d3201158-b2f1-492e-ba12-99cad4010c00";

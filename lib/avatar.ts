export const generatedAvatarUrl = (seed: string) =>
  `https://api.dicebear.com/10.x/glass/svg?seed=${encodeURIComponent(seed)}&size=32`;

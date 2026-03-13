export function deriveHub3RepoId(fullName: string) {
  const parts = [
    hashFragment(fullName, 0x811c9dc5),
    hashFragment(fullName, 0x9e3779b1),
    hashFragment(fullName, 0x85ebca77)
  ];

  return parts.map((part) => part.toString(16).padStart(8, '0')).join('').slice(0, 24);
}

function hashFragment(input: string, seed: number) {
  let hash = seed >>> 0;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

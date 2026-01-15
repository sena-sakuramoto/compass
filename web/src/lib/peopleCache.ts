import type { Person } from './types';
import type { ProjectMember } from './auth-types';

export const PEOPLE_CACHE_TTL_MS = 5 * 60 * 1000;

export function readPeopleCache(key: string): { people: Person[]; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { people?: Person[]; fetchedAt?: number };
    if (!Array.isArray(parsed.people) || typeof parsed.fetchedAt !== 'number') return null;
    return { people: parsed.people, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

export function writePeopleCache(key: string, people: Person[]) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        people,
        fetchedAt: Date.now(),
      })
    );
  } catch {
    // ignore cache write failures
  }
}

export function buildMemberNamesFromMembers(members: ProjectMember[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  members.forEach((member) => {
    const name =
      member.displayName?.trim() ||
      member.email?.split('@')[0]?.trim() ||
      '';
    if (!name) return;
    const key = member.userId || member.email || name;
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });
  return names.sort((a, b) => a.localeCompare(b, 'ja'));
}

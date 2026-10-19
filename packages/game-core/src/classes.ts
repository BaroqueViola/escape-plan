// Chaos mode classes: three per side.
import type { Role } from './types.js';

export type PrisonerClass = 'allmight' | 'naruto' | 'sukuna';
export type WardenClass = 'afo' | 'sasuke' | 'gojo';
export type ClassId = PrisonerClass | WardenClass;

export const CLASSES: Readonly<Record<Role, readonly ClassId[]>> = {
  prisoner: ['allmight', 'naruto', 'sukuna'],
  warden: ['afo', 'sasuke', 'gojo'],
};

export const sideOf = (cls: ClassId): Role => CLASSES.prisoner.includes(cls) ? 'prisoner' : 'warden';

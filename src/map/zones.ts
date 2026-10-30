// Round 8 (2.3): a faint band per US time zone, by state. Not exact: several states are split between two zones; each
// is shaded by the zone of its NBA arena city, or, without an arena, by its main (most populous) zone. PROJECT.md lists
// them. Alaska and Hawaii aren't drawn; Canada and Mexico aren't shaded (only Toronto has an NBA arena: ET).

export type Zone = 'ET' | 'CT' | 'MT' | 'PT';

export const ZONE_NAMES: Record<Zone, string> = { ET: 'Eastern', CT: 'Central', MT: 'Mountain', PT: 'Pacific' };

const ET = 'CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV';
const CT = 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI';
const MT = 'AZ CO ID MT NM UT WY';
const PT = 'CA NV OR WA';

export const STATE_ZONE: Readonly<Record<string, Zone>> = Object.fromEntries(
  ([['ET', ET], ['CT', CT], ['MT', MT], ['PT', PT]] as const).flatMap(([z, s]) => s.split(' ').map((st) => [st, z])),
);

/**
 * The split states and the zone each is shaded with (why). FL, IN, MI, TN, TX, OR have an NBA arena in the shaded zone;
 * the others have none and take their main zone.
 */
export const SPLIT_STATES: Readonly<Record<string, string>> = {
  FL: 'ET — Miami, Orlando (the western panhandle is CT)',
  IN: 'ET — Indianapolis (NW and SW corners are CT)',
  MI: 'ET — Detroit (four Upper Peninsula counties are CT)',
  TN: 'CT — Memphis (East Tennessee is ET)',
  TX: 'CT — Dallas, Houston, San Antonio, Austin (El Paso area is MT)',
  OR: 'PT — Portland (most of Malheur County is MT)',
  KY: 'ET — main zone, no arena (the western half is CT)',
  KS: 'CT — main zone, no arena (four western counties are MT)',
  NE: 'CT — main zone, no arena (the western panhandle is MT)',
  ND: 'CT — main zone, no arena (the southwest is MT)',
  SD: 'CT — main zone, no arena (the western half is MT)',
  ID: 'MT — main zone, no arena (the northern panhandle is PT)',
};

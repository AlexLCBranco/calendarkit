// Round 21 (items 4 and 10): the one knockout venue marker. A home-court game: a "HOST" tag on the host team (put it next
// to that team). A neutral-court game: a high-contrast "NEUTRAL · Hinkle Fieldhouse, Indianapolis" badge, and no host
// tag on either team. Unknown venue: "venue TBD". The venue always comes from data (the feed's arena, a stored past
// season, or the rules' "higher seed hosts" for an undecided game in the simulator) — never assumed here.

export type Venue = { kind: 'host'; teamId: number } | { kind: 'neutral'; arena: string; city?: string } | { kind: 'tbd' };

/** The tag beside the host team. */
export const HostTag = () => (
  <span className="ck-venue-host" title="Home court: this team hosts" data-testid="venue-host">
    HOST
  </span>
);

/** The game's venue badge: neutral (with the arena) or TBD; a hosted game shows nothing here (its HostTag is on the team). */
export function VenueBadge({ venue }: { venue: Venue }) {
  if (venue.kind === 'neutral')
    return (
      <span className="ck-venue-neutral" data-testid="venue-neutral" title="Neutral court: neither team is at home">
        Neutral · {venue.arena}
        {venue.city ? `, ${venue.city}` : ''}
      </span>
    );
  if (venue.kind === 'tbd')
    return (
      <span className="ck-venue-tbd" data-testid="venue-tbd">
        venue TBD
      </span>
    );
  return null;
}
